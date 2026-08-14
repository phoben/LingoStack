//! Tauri IPC commands：配置读写、Prompt 查询、流式聊天。

use futures::StreamExt;
use lingostack_core::config::{AppConfig, Feature, ProviderConfig, ProviderKind};
use lingostack_llm::{ChatMessage, ChatRequest, LlmProvider};
use tauri::ipc::Channel;
use tauri::State;

use crate::config as config_store;
use crate::AppState;

#[cfg(feature = "e2e")]
mod e2e_fixture {
    use std::sync::atomic::{AtomicBool, Ordering};

    use futures::stream::{self, BoxStream};
    use lingostack_llm::{ChatChunk, ChatRequest, LlmError, LlmProvider};

    static ERROR_WAS_RETURNED: AtomicBool = AtomicBool::new(false);

    pub const BASE_URL: &str = "lingostack-e2e://fixture";
    pub const MODEL: &str = "lingostack-e2e";
    pub const ERROR_THEN_SUCCESS_INPUT: &str = "E2E_ERROR_THEN_SUCCESS";
    pub const SUCCESS_OUTPUT: &str = "确定性的 E2E 翻译结果";

    pub struct FixtureProvider;

    impl LlmProvider for FixtureProvider {
        fn chat_stream<'a>(
            &'a self,
            request: &'a ChatRequest,
        ) -> BoxStream<'a, Result<ChatChunk, LlmError>> {
            let input = request
                .messages
                .iter()
                .rev()
                .find(|message| matches!(message.role, lingostack_llm::ChatRole::User))
                .map(|message| message.content.as_str())
                .unwrap_or_default();
            if input == ERROR_THEN_SUCCESS_INPUT && !ERROR_WAS_RETURNED.swap(true, Ordering::SeqCst)
            {
                return Box::pin(stream::iter([Err(LlmError::Network(
                    "E2E fixture: 可重试的确定性错误".into(),
                ))]));
            }
            Box::pin(stream::iter([
                Ok(ChatChunk {
                    delta: SUCCESS_OUTPUT[.."确定性的 ".len()].into(),
                }),
                Ok(ChatChunk {
                    delta: SUCCESS_OUTPUT["确定性的 ".len()..].into(),
                }),
            ]))
        }
    }
}

/// 读取当前系统选中文本（UIA 优先，失败降级剪贴板）。
///
/// 返回的 `source` 标明来源，前端据此提示用户（如降级到剪贴板时说明，§9）。
#[tauri::command]
pub fn get_selection() -> Result<lingostack_selection::Selection, String> {
    lingostack_selection::provider()
        .get_selection()
        .map_err(|e| e.to_string())
}

/// 朗读文本（异步，打断上一句）。
#[tauri::command]
pub fn speak(text: String) -> Result<(), String> {
    lingostack_tts::speaker()
        .speak(&text)
        .map_err(|e| e.to_string())
}

/// 停止当前朗读。
#[tauri::command]
pub fn stop_speaking() -> Result<(), String> {
    lingostack_tts::speaker().stop().map_err(|e| e.to_string())
}

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
/// 四种协议均已实装；Ollama 复用 OpenAI 兼容协议（同一 wire format）。
fn build_provider(p: &ProviderConfig) -> Result<Box<dyn LlmProvider>, String> {
    #[cfg(feature = "e2e")]
    if p.base_url == e2e_fixture::BASE_URL
        && p.models.iter().any(|model| model == e2e_fixture::MODEL)
    {
        return Ok(Box::new(e2e_fixture::FixtureProvider));
    }

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
        ProviderKind::Gemini => {
            let provider =
                lingostack_llm::gemini::GeminiProvider::new(p.base_url.clone(), p.api_key.clone())
                    .map_err(|e| e.to_string())?;
            Ok(Box::new(provider))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(feature = "e2e")]
    use futures::StreamExt;

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
    fn build_provider_gemini_ok() {
        let mut p = deepseek();
        p.kind = ProviderKind::Gemini;
        p.base_url = "https://generativelanguage.googleapis.com".into();
        assert!(build_provider(&p).is_ok());
    }

    #[test]
    fn build_provider_covers_all_kinds() {
        // 四种协议均已实装——新增 ProviderKind 时此测试会因缺分支而编译失败。
        for kind in [
            ProviderKind::OpenAiCompatible,
            ProviderKind::Ollama,
            ProviderKind::Anthropic,
            ProviderKind::Gemini,
        ] {
            let mut p = deepseek();
            p.kind = kind;
            assert!(build_provider(&p).is_ok(), "协议 {kind:?} 构造失败");
        }
    }

    #[test]
    fn build_provider_ollama_reuses_openai() {
        let mut p = deepseek();
        p.kind = ProviderKind::Ollama;
        p.base_url = "http://localhost:11434".into();
        assert!(build_provider(&p).is_ok());
    }

    #[cfg(feature = "e2e")]
    #[test]
    fn e2e_fixture_provider_streams_known_chunks_without_a_client() {
        let p = ProviderConfig {
            id: "e2e".into(),
            kind: ProviderKind::OpenAiCompatible,
            name: "E2E fixture".into(),
            base_url: e2e_fixture::BASE_URL.into(),
            api_key: "not-a-real-key".into(),
            models: vec![e2e_fixture::MODEL.into()],
        };
        let provider = build_provider(&p).unwrap();
        let request = ChatRequest::new(
            e2e_fixture::MODEL,
            vec![lingostack_llm::ChatMessage {
                role: lingostack_llm::ChatRole::User,
                content: "E2E_SUCCESS".into(),
            }],
        );
        let chunks = futures::executor::block_on(
            provider
                .chat_stream(&request)
                .map(|chunk| chunk.unwrap().delta)
                .collect::<Vec<_>>(),
        );
        assert_eq!(chunks, vec!["确定性的 ", "E2E 翻译结果"]);
    }
}
