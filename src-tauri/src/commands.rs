//! Tauri IPC commands：配置读写、Prompt 查询、流式聊天。

use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures::StreamExt;
use lingostack_core::config::{AppConfig, Feature, ProviderConfig, ProviderKind};
use lingostack_core::hotkey::HotkeyBinding;
use lingostack_core::lang::{Language, TranslationPlan};
use lingostack_core::prompt::compose_translation_prompt;
use lingostack_llm::{ChatMessage, ChatRequest, LlmError, LlmProvider};
use tauri::ipc::Channel;
#[cfg(feature = "e2e")]
use tauri::Emitter;
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
    pub const TERMS_INPUT: &str = "E2E_TERMS";
    pub const TERMS_OUTPUT: &str = "确定性的 fixture 术语译文\n<<<LINGOSTACK_TERMS_V1>>>\n[{\"term\":\"fixture\",\"category\":\"technology\",\"explanation\":\"确定性测试术语\"}]";
    pub const NAMING_INPUT: &str = "E2E_NAMING";
    pub const NAMING_OUTPUT: &str =
        "cache invalidator\nrequest router\nfeature flag\nsession token\nerror boundary";
    pub const SELECTION_TEXT: &str = "E2E_CLIPBOARD_SELECTION";
    pub const TTS_TEXT: &str = SELECTION_TEXT;

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
                return Box::pin(stream::iter([Err(LlmError::Stream(
                    "E2E fixture: 首次请求的确定性错误".into(),
                ))]));
            }
            if input == TERMS_INPUT || input == NAMING_INPUT {
                let output = if input == TERMS_INPUT {
                    TERMS_OUTPUT
                } else {
                    NAMING_OUTPUT
                };
                return Box::pin(stream::iter([Ok(ChatChunk {
                    delta: output.into(),
                })]));
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
    #[cfg(feature = "e2e")]
    if text == e2e_fixture::TTS_TEXT {
        return Ok(());
    }
    lingostack_tts::speaker()
        .speak(&text)
        .map_err(|e| e.to_string())
}

/// 停止当前朗读。
#[tauri::command]
pub fn stop_speaking() -> Result<(), String> {
    #[cfg(feature = "e2e")]
    {
        return Ok(());
    }
    #[cfg(not(feature = "e2e"))]
    lingostack_tts::speaker().stop().map_err(|e| e.to_string())
}

#[cfg(feature = "e2e")]
/// 仅供 feature-gated desktop E2E 触发真实前端事件；不进入生产 command 表。
#[tauri::command]
pub fn e2e_emit_translate_selection(app: tauri::AppHandle) -> Result<(), String> {
    app.emit(
        "translate-selection",
        crate::hotkeys::TranslateSelectionPayload {
            selection: Some(lingostack_selection::Selection {
                text: e2e_fixture::SELECTION_TEXT.into(),
                source: lingostack_selection::SelectionSource::Clipboard,
            }),
            error: None,
        },
    )
    .map_err(|error| error.to_string())
}

#[cfg(feature = "e2e")]
/// 仅供 feature-gated desktop E2E 注入热键冲突/恢复事件；不触碰系统热键注册表。
#[tauri::command]
pub fn e2e_emit_hotkey_status(app: tauri::AppHandle, conflicted: bool) -> Result<(), String> {
    let statuses = vec![crate::hotkeys::HotkeyStatus {
        action: lingostack_core::hotkey::HotkeyAction::TranslateSelection,
        accelerator: "Ctrl+Shift+D".into(),
        registered: !conflicted,
        error: conflicted.then(|| "E2E fixture: occupied".into()),
    }];
    app.emit(crate::hotkeys::HOTKEY_STATUS_EVENT, statuses)
        .map_err(|error| error.to_string())
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

/// 保存并立即重新注册全局热键，始终返回每一项的可观察状态。
#[tauri::command]
pub fn register_hotkeys(
    bindings: Vec<HotkeyBinding>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<crate::hotkeys::HotkeyStatus>, String> {
    let mut cfg = config_store::load(&state.config_path).map_err(|e| e.to_string())?;
    cfg.hotkeys = bindings;
    cfg.normalize_hotkeys();
    config_store::save(&state.config_path, &cfg).map_err(|e| e.to_string())?;
    Ok(crate::hotkeys::reregister_and_report(&app, &cfg.hotkeys))
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

/// 按 core 的四级规则解析一次翻译将使用的语言对。
#[tauri::command]
pub fn translation_plan(
    text: String,
    source_override: Option<Language>,
    target_override: Option<Language>,
    effective_system_language: Option<Language>,
    state: State<'_, AppState>,
) -> Result<TranslationPlan, String> {
    let cfg = config_store::load(&state.config_path).map_err(|e| e.to_string())?;
    Ok(TranslationPlan::resolve(
        &text,
        source_override,
        target_override,
        &cfg.pair_mappings,
        cfg.ui_language
            .translation_language(effective_system_language),
        cfg.global_default_target,
    ))
}

/// 返回替换语言占位符并追加强制术语协议后的翻译 Prompt。
#[tauri::command]
pub fn effective_translation_prompt(
    source: Language,
    target: Language,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let cfg = config_store::load(&state.config_path).map_err(|e| e.to_string())?;
    let base = cfg
        .prompt_overrides
        .translate()
        .replace("{source_lang}", source.display_name())
        .replace("{target_lang}", target.display_name());
    Ok(compose_translation_prompt(&base, source))
}

/// [`chat_stream`] 经 Channel 推回前端的流式事件。
#[derive(serde::Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatEvent {
    /// 一个增量文本片段。
    Chunk { delta: String },
    /// 仍在处理但需要告知用户的临时状态（例如共享限流冷却）。
    Status { message: String },
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
    let request = ChatRequest::new(model_ref.model.clone(), messages);
    let mut retried = false;
    loop {
        if let Some(delay) = shared_cooldown_delay(&state.rate_limit_until, Instant::now()) {
            on_event
                .send(ChatEvent::Status {
                    message: "服务繁忙，正在短暂等待后重试…".into(),
                })
                .map_err(|e| e.to_string())?;
            tokio::time::sleep(delay).await;
        }
        let provider = build_provider(provider_cfg)?;
        let mut stream = provider.chat_stream(&request);
        let mut sent_chunk = false;
        let mut retry_error: Option<LlmError> = None;
        while let Some(result) = stream.next().await {
            match result {
                Ok(chunk) => {
                    sent_chunk = true;
                    on_event
                        .send(ChatEvent::Chunk { delta: chunk.delta })
                        .map_err(|e| e.to_string())?;
                }
                Err(e) if should_retry(sent_chunk, retried, &e) => {
                    retry_error = Some(e);
                    break;
                }
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
        if let Some(error) = retry_error {
            retried = true;
            if error.is_rate_limited() {
                extend_shared_cooldown(
                    &state.rate_limit_until,
                    Instant::now(),
                    Duration::from_secs(1),
                );
            } else {
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
            continue;
        }
        break;
    }
    on_event.send(ChatEvent::Done).ok();
    Ok(())
}

fn should_retry(sent_chunk: bool, retried: bool, error: &LlmError) -> bool {
    !sent_chunk && !retried && error.is_retryable()
}

/// 返回所有请求都必须遵守的限流剩余时间，不在锁内等待。
fn shared_cooldown_delay(cooldown: &Mutex<Option<Instant>>, now: Instant) -> Option<Duration> {
    cooldown
        .lock()
        .ok()
        .and_then(|until| until.and_then(|deadline| deadline.checked_duration_since(now)))
}

/// 429 只会延长而不会缩短现有冷却，保证并发请求共享同一个节流边界。
fn extend_shared_cooldown(cooldown: &Mutex<Option<Instant>>, now: Instant, duration: Duration) {
    if let Ok(mut until) = cooldown.lock() {
        let next = now + duration;
        if until.map_or(true, |current| current < next) {
            *until = Some(next);
        }
    }
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

    #[test]
    fn retry_policy_only_retries_zero_output_retryable_errors() {
        assert!(should_retry(false, false, &LlmError::Timeout));
        assert!(!should_retry(true, false, &LlmError::Timeout));
        assert!(!should_retry(false, true, &LlmError::Timeout));
        assert!(!should_retry(
            false,
            false,
            &LlmError::Stream("bad envelope".into())
        ));
    }

    #[test]
    fn rate_limit_cooldown_is_shared_and_only_extends() {
        let cooldown = Mutex::new(None);
        let now = Instant::now();
        extend_shared_cooldown(&cooldown, now, Duration::from_secs(1));
        assert!(shared_cooldown_delay(&cooldown, now + Duration::from_millis(500)).is_some());
        extend_shared_cooldown(
            &cooldown,
            now + Duration::from_millis(100),
            Duration::from_millis(100),
        );
        assert!(shared_cooldown_delay(&cooldown, now + Duration::from_millis(500)).is_some());
        assert!(shared_cooldown_delay(&cooldown, now + Duration::from_secs(2)).is_none());
    }

    #[test]
    fn status_event_serializes_for_the_typescript_ipc_mirror() {
        let json = serde_json::to_string(&ChatEvent::Status {
            message: "服务繁忙，正在短暂等待后重试…".into(),
        })
        .unwrap();
        assert_eq!(
            json,
            "{\"type\":\"status\",\"message\":\"服务繁忙，正在短暂等待后重试…\"}"
        );
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
