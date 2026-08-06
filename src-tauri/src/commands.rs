//! Tauri IPC commands：配置读写、Prompt 查询、流式聊天。

use futures::StreamExt;
use lingostack_core::config::{AppConfig, Feature, ProviderConfig, ProviderKind};
use lingostack_llm::{ChatMessage, ChatRequest, LlmProvider};
use tauri::ipc::Channel;
use tauri::State;

use crate::config as config_store;
use crate::AppState;

/// 加载应用配置；文件不存在时回退默认值（首次运行）。
#[tauri::command]
pub fn load_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    config_store::load(&state.config_path).map_err(|e| e.to_string())
}

/// 保存应用配置（Unix 权限 0600，见 [`config_store::save`]）。
#[tauri::command]
pub fn save_config(cfg: AppConfig, state: State<'_, AppState>) -> Result<(), String> {
    config_store::save(&state.config_path, &cfg).map_err(|e| e.to_string())
}

/// 返回某功能当前生效的 Prompt（用户覆盖优先，否则内置）。
///
/// 返回值含 `{source_lang}` / `{target_lang}` / `{style}` 等占位符，由前端替换。
#[tauri::command]
pub fn effective_prompt(feature: Feature, state: State<'_, AppState>) -> Result<String, String> {
    let cfg = config_store::load(&state.config_path).map_err(|e| e.to_string())?;
    let prompt = match feature {
        Feature::Translate | Feature::DocTranslate => cfg.prompt_overrides.translate(),
        Feature::Naming => cfg.prompt_overrides.naming(),
        Feature::Explain => cfg.prompt_overrides.explain(),
    };
    Ok(prompt.to_string())
}

/// [`chat_stream`] 经 Channel 推回前端的流式事件。
#[derive(serde::Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatEvent {
    /// 一个增量文本片段。
    Chunk { delta: String },
    /// 流正常结束。
    Done,
    /// 流中段出错（已渲染部分保留，前端可「重试」，见 §9）。
    Error { message: String },
}

/// 按 feature 解析模型并发起流式聊天，增量经 Channel 推回前端。
#[tauri::command]
pub async fn chat_stream(
    feature: Feature,
    messages: Vec<ChatMessage>,
    on_event: Channel<ChatEvent>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let cfg = config_store::load(&state.config_path).map_err(|e| e.to_string())?;
    let (provider_cfg, model_ref) = cfg.resolve_model(feature).map_err(|e| e.to_string())?;
    let provider = build_provider(provider_cfg)?;
    let request = ChatRequest::new(model_ref.model.clone(), messages);
    let mut stream = provider.chat_stream(&request);
    while let Some(result) = stream.next().await {
        match result {
            Ok(chunk) => on_event
                .send(ChatEvent::Chunk { delta: chunk.delta })
                .map_err(|e| e.to_string())?,
            Err(e) => {
                on_event
                    .send(ChatEvent::Error {
                        message: e.to_string(),
                    })
                    .ok();
                return Err(e.to_string());
            }
        }
    }
    on_event.send(ChatEvent::Done).ok();
    Ok(())
}

/// 由 [`ProviderConfig`] 构造具体 LLM 提供商实例。
///
/// Anthropic / Gemini 留待 A2b / A2c 实装；Ollama 复用 OpenAI 兼容协议。
fn build_provider(p: &ProviderConfig) -> Result<Box<dyn LlmProvider>, String> {
    match p.kind {
        ProviderKind::OpenAiCompatible | ProviderKind::Ollama => {
            let provider =
                lingostack_llm::openai::OpenAiProvider::new(p.base_url.clone(), p.api_key.clone())
                    .map_err(|e| e.to_string())?;
            Ok(Box::new(provider))
        }
        ProviderKind::Anthropic => {
            let provider = lingostack_llm::anthropic::AnthropicProvider::new(
                p.base_url.clone(),
                p.api_key.clone(),
            )
            .map_err(|e| e.to_string())?;
            Ok(Box::new(provider))
        }
        ProviderKind::Gemini => Err("Gemini 协议将在 A2c 实现".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn deepseek() -> ProviderConfig {
        ProviderConfig {
            id: "deepseek-1".into(),
            kind: ProviderKind::OpenAiCompatible,
            name: "DeepSeek".into(),
            base_url: "https://api.deepseek.com".into(),
            api_key: "sk-test".into(),
            models: vec!["deepseek-chat".into()],
        }
    }

    #[test]
    fn build_provider_openai_compatible_ok() {
        assert!(build_provider(&deepseek()).is_ok());
    }

    #[test]
    fn build_provider_anthropic_ok() {
        let mut p = deepseek();
        p.kind = ProviderKind::Anthropic;
        p.base_url = "https://api.anthropic.com".into();
        assert!(build_provider(&p).is_ok());
    }

    #[test]
    fn build_provider_gemini_not_implemented() {
        let mut p = deepseek();
        p.kind = ProviderKind::Gemini;
        let err = build_provider(&p).err().expect("期望 Gemini 未实装错误");
        assert!(err.contains("A2c"));
    }

    #[test]
    fn build_provider_ollama_reuses_openai() {
        let mut p = deepseek();
        p.kind = ProviderKind::Ollama;
        p.base_url = "http://localhost:11434".into();
        assert!(build_provider(&p).is_ok());
    }
}
