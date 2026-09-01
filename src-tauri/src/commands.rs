//! Tauri IPC commands：配置读写、Prompt 查询、流式聊天。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures::StreamExt;
use lingostack_core::config::{AppConfig, Feature, ProviderConfig, ProviderKind};
use lingostack_core::hotkey::HotkeyBinding;
use lingostack_core::lang::{Language, TranslationPlan};
use lingostack_core::prompt::{compose_explain_prompt, compose_translation_prompt};
use lingostack_document::{DocumentTranslationPort, DocumentTranslationRequest, DocumentView};
use lingostack_llm::{ChatMessage, ChatRequest, LlmError, LlmProvider};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, State};

use crate::config as config_store;
use crate::AppState;

/// Return locally persisted document snapshots. The frontend holds only these
/// snapshots; Rust keeps the durable records while the window is hidden.
#[tauri::command]
pub fn list_documents(
    state: State<'_, AppState>,
) -> Result<Vec<lingostack_document::DocumentSnapshot>, String> {
    state
        .documents
        .lock()
        .map_err(|_| "document storage is unavailable".to_string())?
        .list()
        .map_err(|error| error.to_string())
}

/// Process-stable, environment-derived import limits exposed for accurate UI
/// guidance. They are read once at startup, matching the parser's behavior.
#[derive(Clone, serde::Serialize)]
pub struct DocumentLimits {
    pub max_input_bytes: usize,
    pub max_text_chars: usize,
}

#[tauri::command]
pub fn document_limits(state: State<'_, AppState>) -> DocumentLimits {
    DocumentLimits {
        max_input_bytes: state.document_limits.max_input_bytes,
        max_text_chars: state.document_limits.max_text_chars,
    }
}

/// Import already-selected bytes. Native selection/drag-drop stays at the
/// desktop boundary; this command never receives or persists an absolute path.
#[tauri::command]
pub fn import_document(
    file_name: String,
    content: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<lingostack_document::ImportOutcome, String> {
    state
        .documents
        .lock()
        .map_err(|_| "document storage is unavailable".to_string())?
        .import_bytes(&file_name, &content)
        .map_err(|error| error.to_string())
}

/// Typed durable-job update. The renderer may disappear; listeners simply
/// refresh the persisted snapshot when they next exist.
#[derive(Clone, serde::Serialize)]
pub struct DocumentProgressEvent {
    pub document: lingostack_document::DocumentSnapshot,
}

/// Return one continuous Markdown document for source or translation reading.
#[tauri::command]
pub fn document_content(
    document_id: String,
    view: DocumentView,
    state: State<'_, AppState>,
) -> Result<lingostack_document::DocumentContent, String> {
    state
        .documents
        .lock()
        .map_err(|_| "document storage is unavailable".to_string())?
        .document_content(&document_id, view)
        .map_err(|error| error.to_string())
}

/// Deletion is intentionally irreversible after the frontend confirmation.
/// A running job is cooperatively stopped first so an in-flight provider
/// response cannot recreate progress after its record has been removed.
#[tauri::command]
pub fn delete_document(document_id: String, state: State<'_, AppState>) -> Result<(), String> {
    request_document_stop(&document_id, &state, true)?;
    state
        .documents
        .lock()
        .map_err(|_| "document storage is unavailable".to_string())?
        .delete(&document_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn translate_document(
    document_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    start_document_job(document_id, app, &state)
}

#[tauri::command]
pub fn pause_document(document_id: String, state: State<'_, AppState>) -> Result<(), String> {
    request_document_stop(&document_id, &state, false)
}

#[tauri::command]
pub fn cancel_document(document_id: String, state: State<'_, AppState>) -> Result<(), String> {
    request_document_stop(&document_id, &state, true)
}

fn start_document_job(document_id: String, app: AppHandle, state: &AppState) -> Result<(), String> {
    match try_start_document_job(document_id.clone(), app.clone(), state) {
        Ok(()) => Ok(()),
        Err(error) => {
            persist_document_failure(&app, state, &document_id, &error);
            Err(error)
        }
    }
}

fn try_start_document_job(
    document_id: String,
    app: AppHandle,
    state: &AppState,
) -> Result<(), String> {
    let cfg = config_store::load(&state.config_path).map_err(|error| error.to_string())?;
    let (provider_cfg, model_ref) = cfg
        .resolve_model(Feature::DocTranslate)
        .map_err(|error| error.to_string())?;
    // Resolve the document's language pair in Rust, using the exact same
    // configured mapping/default rules as all other translation entry points.
    // `System` has no browser locale on this side and therefore follows the
    // established English fallback in `UiLanguage::translation_language`.
    let source_text = state
        .documents
        .lock()
        .map_err(|_| "document storage is unavailable".to_string())?
        .document_content(&document_id, DocumentView::Source)
        .map_err(|error| error.to_string())?;
    let plan = document_translation_plan(&cfg, &source_text.markdown);
    let port = LiveDocumentPort {
        provider: build_provider(provider_cfg)?,
        model: model_ref.model.clone(),
        prompt: document_prompt_from_plan(&cfg, plan),
        target: plan.target,
    };
    let control = Arc::new(crate::DocumentJobControl {
        lifecycle: Mutex::new(()),
        pause_requested: AtomicBool::new(false),
        cancel_requested: AtomicBool::new(false),
    });
    {
        let mut jobs = state
            .document_jobs
            .lock()
            .map_err(|_| "document jobs are unavailable".to_string())?;
        if jobs.contains_key(&document_id) {
            return Ok(());
        }
        jobs.insert(document_id.clone(), control.clone());
    }
    if let Err(error) = state
        .documents
        .lock()
        .map_err(|_| "document storage is unavailable".to_string())?
        .begin_translation(&document_id)
    {
        state
            .document_jobs
            .lock()
            .ok()
            .map(|mut jobs| jobs.remove(&document_id));
        return Err(error.to_string());
    }
    if let Ok(documents) = state.documents.lock() {
        emit_document_progress(&app, &documents, &document_id);
    }
    let documents = Arc::clone(&state.documents);
    let jobs = Arc::clone(&state.document_jobs);
    tauri::async_runtime::spawn(async move {
        run_document_job(app, document_id, documents, jobs, control, port).await;
    });
    Ok(())
}

/// Persist setup failures before returning the command error. The renderer may
/// not be mounted when this happens, so a transient IPC rejection alone is not
/// an observable document outcome.
fn persist_document_failure(app: &AppHandle, state: &AppState, id: &str, error: &str) {
    if let Ok(mut documents) = state.documents.lock() {
        let _ = documents.mark_document_failed(id, &safe_document_failure_message(error));
        emit_document_progress(app, &documents, id);
    }
}

fn safe_document_failure_message(error: &str) -> String {
    // Provider errors are specified not to include API keys. Still cap any
    // unexpected remote body before it becomes durable UI state.
    const MAX_CHARS: usize = 500;
    let message = error.trim();
    if message.is_empty() {
        return "document translation failed without a recorded reason".into();
    }
    let redacted = redact_document_failure_secrets(message);
    if redacted.chars().count() > MAX_CHARS {
        let shortened = redacted.chars().take(MAX_CHARS - 1).collect::<String>();
        format!("{shortened}…")
    } else {
        redacted
    }
}

fn redact_document_failure_secrets(message: &str) -> String {
    let mut redact_next = false;
    let whitespace_redacted = message
        .split_whitespace()
        .map(|token| {
            if redact_next {
                redact_next = false;
                return "[redacted]".to_owned();
            }
            let lowercase = token.to_ascii_lowercase();
            if lowercase == "bearer"
                || lowercase.ends_with("bearer:")
                || lowercase == "token"
                || lowercase.ends_with("token:")
            {
                redact_next = true;
                return token.to_owned();
            }
            if token.starts_with("sk-")
                || lowercase.starts_with("token=")
                || lowercase.starts_with("api_key=")
                || lowercase.starts_with("apikey=")
            {
                return "[redacted]".to_owned();
            }
            token.to_owned()
        })
        .collect::<Vec<_>>()
        .join(" ");

    // A provider may put a credential in a URL query or a compact JSON error
    // body, neither of which has whitespace around the value. Redact only
    // explicit credential field spellings so ordinary error prose remains
    // useful to the user.
    [
        "api_key=",
        "api_key:",
        "apikey=",
        "apikey:",
        "access_token=",
        "access_token:",
        "token=",
        "token:",
        "?key=",
        "&key=",
        "\"api_key\":\"",
        "\"apiKey\":\"",
        "\"access_token\":\"",
        "\"token\":\"",
    ]
    .into_iter()
    .fold(whitespace_redacted, |current, marker| {
        redact_document_failure_value(&current, marker)
    })
}

fn redact_document_failure_value(message: &str, marker: &str) -> String {
    let lowercase = message.to_ascii_lowercase();
    let marker_lowercase = marker.to_ascii_lowercase();
    let mut output = String::with_capacity(message.len());
    let mut cursor = 0;
    while let Some(found) = lowercase[cursor..].find(&marker_lowercase) {
        let start = cursor + found;
        let value_start = start + marker.len();
        output.push_str(&message[cursor..value_start]);
        let value_end = message[value_start..]
            .char_indices()
            .find_map(|(offset, character)| {
                matches!(
                    character,
                    '&' | ',' | '}' | ']' | '"' | '\'' | ' ' | '\r' | '\n'
                )
                .then_some(value_start + offset)
            })
            .unwrap_or(message.len());
        output.push_str("[redacted]");
        cursor = value_end;
    }
    output.push_str(&message[cursor..]);
    output
}

/// Resolve automatic language detection and configuration fallback for a
/// document before its first provider request.
fn document_translation_plan(config: &AppConfig, source_text: &str) -> TranslationPlan {
    TranslationPlan::resolve(
        source_text,
        None,
        None,
        &config.pair_mappings,
        config.ui_language.translation_language(None),
        config.global_default_target,
    )
}

fn document_prompt_from_plan(config: &AppConfig, plan: TranslationPlan) -> String {
    config
        .prompt_overrides
        .doc_translate()
        .replace("{source_lang}", plan.source.display_name())
        .replace("{target_lang}", plan.target.display_name())
}

#[cfg(test)]
fn document_prompt(config: &AppConfig, source_text: &str) -> String {
    document_prompt_from_plan(config, document_translation_plan(config, source_text))
}

fn request_document_stop(document_id: &str, state: &AppState, cancel: bool) -> Result<(), String> {
    let control = state
        .document_jobs
        .lock()
        .map_err(|_| "document jobs are unavailable".to_string())?
        .get(document_id)
        .cloned();
    if let Some(control) = control {
        let _lifecycle = control
            .lifecycle
            .lock()
            .map_err(|_| "document job is unavailable".to_string())?;
        // A job can finish after the caller obtained its Arc. Do not let that
        // stale control turn an already completed document back into paused.
        let still_running = state
            .document_jobs
            .lock()
            .map_err(|_| "document jobs are unavailable".to_string())?
            .get(document_id)
            .is_some_and(|current| Arc::ptr_eq(current, &control));
        if !still_running {
            return Ok(());
        }
        if cancel {
            control.cancel_requested.store(true, Ordering::Release);
        }
        control.pause_requested.store(true, Ordering::Release);
        state
            .documents
            .lock()
            .map_err(|_| "document storage is unavailable".to_string())?
            .pause(document_id)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

async fn run_document_job(
    app: AppHandle,
    document_id: String,
    documents: Arc<Mutex<lingostack_document::DocumentModule>>,
    jobs: Arc<Mutex<std::collections::HashMap<String, Arc<crate::DocumentJobControl>>>>,
    control: Arc<crate::DocumentJobControl>,
    mut port: LiveDocumentPort,
) {
    let request = match documents.lock() {
        Ok(documents) => documents.document_translation_request(&document_id),
        Err(_) => {
            finish_document_job(&jobs, &document_id);
            return;
        }
    };
    let request = match request {
        Ok(Some(request)) => request,
        Ok(None) => {
            finish_document_job(&jobs, &document_id);
            return;
        }
        Err(error) => {
            if let Ok(mut documents) = documents.lock() {
                let _ = documents.mark_document_failed(
                    &document_id,
                    &safe_document_failure_message(&error.to_string()),
                );
                emit_document_progress(&app, &documents, &document_id);
            }
            finish_document_job(&jobs, &document_id);
            return;
        }
    };
    let paused_before_request = control
        .lifecycle
        .lock()
        .map(|_lifecycle| control.pause_requested.load(Ordering::Acquire))
        .unwrap_or(true);
    if paused_before_request {
        finish_document_job(&jobs, &document_id);
        return;
    }
    let result = if should_skip_document_request(&request, port.target) {
        Ok(request.source)
    } else {
        port.translate(request).await
    };
    if let Ok(_lifecycle) = control.lifecycle.lock() {
        if let Ok(mut documents) = documents.lock() {
            if !document_job_should_persist(&control) {
                let _ = documents.pause(&document_id);
            } else if let Ok(translation) = result {
                match documents.save_document_translation(&document_id, &translation) {
                    Ok(()) => {
                        if let Err(error) = documents.finish_translation(&document_id) {
                            let _ = documents.mark_document_failed(
                                &document_id,
                                &safe_document_failure_message(&error.to_string()),
                            );
                        }
                    }
                    Err(error) => {
                        let _ = documents.mark_document_failed(
                            &document_id,
                            &safe_document_failure_message(&error.to_string()),
                        );
                    }
                }
            } else if let Err(error) = result {
                let _ = documents
                    .mark_document_failed(&document_id, &safe_document_failure_message(&error));
            }
            emit_document_progress(&app, &documents, &document_id);
        }
        finish_document_job(&jobs, &document_id);
    } else {
        finish_document_job(&jobs, &document_id);
    }
}

fn finish_document_job(
    jobs: &Mutex<std::collections::HashMap<String, Arc<crate::DocumentJobControl>>>,
    document_id: &str,
) {
    if let Ok(mut jobs) = jobs.lock() {
        jobs.remove(document_id);
    }
}

fn document_job_should_persist(control: &crate::DocumentJobControl) -> bool {
    !control.pause_requested.load(Ordering::Acquire)
}

fn should_skip_document_request(request: &DocumentTranslationRequest, target: Language) -> bool {
    Language::detect(&request.source) == target
}

fn emit_document_progress(
    app: &AppHandle,
    documents: &lingostack_document::DocumentModule,
    id: &str,
) {
    if let Ok(Some(document)) = documents.snapshot_by_id(id) {
        let _ = app.emit("document-progress", DocumentProgressEvent { document });
    }
}

struct LiveDocumentPort {
    provider: Box<dyn LlmProvider>,
    model: String,
    prompt: String,
    target: Language,
}
impl lingostack_document::DocumentTranslationPort for LiveDocumentPort {
    fn translate<'a>(
        &'a mut self,
        request: DocumentTranslationRequest,
    ) -> futures::future::BoxFuture<'a, Result<String, String>> {
        let request = ChatRequest::new(
            self.model.clone(),
            vec![
                ChatMessage::system(self.prompt.clone()),
                ChatMessage::user(format_document_request(&request)),
            ],
        );
        Box::pin(async move {
            let mut retried = false;
            loop {
                let mut stream = self.provider.chat_stream(&request);
                let mut output = String::new();
                let mut retry_error = None;
                while let Some(chunk) = stream.next().await {
                    match chunk {
                        Ok(chunk) => output.push_str(&chunk.delta),
                        Err(error) if should_retry(!output.is_empty(), retried, &error) => {
                            retry_error = Some(error);
                            break;
                        }
                        Err(error) => return Err(error.to_string()),
                    }
                }
                if retry_error.is_some() {
                    retried = true;
                    tokio::time::sleep(Duration::from_millis(250)).await;
                    continue;
                }
                if output.trim().is_empty() {
                    return Err("document translation returned no text".into());
                }
                return Ok(output);
            }
        })
    }
}

fn format_document_request(request: &DocumentTranslationRequest) -> String {
    format!(
        "Translate this complete normalized Markdown document. Return only the translated Markdown document. Preserve Markdown structure, code, commands, URLs, and identifiers.\n\nMarkdown document:\n{source}",
        source = request.source,
    )
}

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
            if input.starts_with("Translate this complete normalized Markdown document.") {
                let source = input
                    .split("\n\nMarkdown document:\n")
                    .nth(1)
                    .unwrap_or_default();
                let translation = source.strip_prefix("# ").map_or_else(
                    || format!("确定性的 {source}"),
                    |heading| format!("# 确定性的 {heading}"),
                );
                return Box::pin(stream::iter([Ok(ChatChunk { delta: translation })]));
            }
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
            if let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(input) {
                let output = items
                    .into_iter()
                    .filter_map(|item| item.get("id")?.as_str().map(|id| {
                        serde_json::json!({ "id": id, "explanation": format!("fixture explanation for {id}") })
                    }))
                    .collect::<Vec<_>>();
                return Box::pin(stream::iter([Ok(ChatChunk {
                    delta: serde_json::to_string(&output).unwrap_or_else(|_| "[]".into()),
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

/// [`speak`] 经 Channel 推回前端的播放状态。
#[derive(serde::Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TtsEvent {
    Started,
    Done,
    Error { message: String },
}

/// 朗读文本（异步，打断上一句）。
#[tauri::command]
pub fn speak(text: String, on_event: Channel<TtsEvent>) -> Result<(), String> {
    #[cfg(feature = "e2e")]
    if text == e2e_fixture::TTS_TEXT {
        std::thread::Builder::new()
            .name("lingostack-tts-e2e".to_owned())
            .spawn(move || {
                let _ = on_event.send(TtsEvent::Started);
                std::thread::sleep(Duration::from_millis(250));
                let _ = on_event.send(TtsEvent::Done);
            })
            .map_err(|error| format!("E2E 朗读夹具线程启动失败: {error}"))?;
        return Ok(());
    }
    let completion = lingostack_tts::speaker()
        .speak(&text)
        .map_err(|e| e.to_string())?;
    on_event
        .send(TtsEvent::Started)
        .map_err(|e| e.to_string())?;
    std::thread::Builder::new()
        .name("lingostack-tts-completion".to_owned())
        .spawn(move || match completion.wait() {
            Ok(lingostack_tts::SpeechOutcome::Finished) => {
                let _ = on_event.send(TtsEvent::Done);
            }
            Ok(lingostack_tts::SpeechOutcome::Interrupted) => {}
            Err(error) => {
                let _ = on_event.send(TtsEvent::Error {
                    message: error.to_string(),
                });
            }
        })
        .map_err(|error| format!("朗读完成监听线程启动失败: {error}"))?;
    Ok(())
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
        Feature::Translate => cfg.prompt_overrides.translate(),
        Feature::DocTranslate => cfg.prompt_overrides.doc_translate(),
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
    explanation_language: Language,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let cfg = config_store::load(&state.config_path).map_err(|e| e.to_string())?;
    let base = cfg
        .prompt_overrides
        .translate()
        .replace("{source_lang}", source.display_name())
        .replace("{target_lang}", target.display_name());
    Ok(compose_translation_prompt(&base, explanation_language))
}

#[derive(Clone, serde::Deserialize)]
pub struct ExplainTermInput {
    pub id: String,
    pub content: String,
}
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct ExplainTermOutput {
    pub id: String,
    pub explanation: String,
}
#[derive(Clone, serde::Serialize)]
pub struct ExplainTermsResponse {
    pub items: Vec<ExplainTermOutput>,
}

fn validate_explain_inputs(items: &[ExplainTermInput]) -> Result<(), String> {
    if items.is_empty() || items.len() > 10 {
        return Err("术语解释一次需要 1 到 10 项内容".into());
    }
    let mut ids = std::collections::HashSet::new();
    for item in items {
        if item.id.trim().is_empty() || item.content.trim().is_empty() {
            return Err("术语标识和内容不能为空".into());
        }
        if !ids.insert(item.id.trim()) {
            return Err("术语标识不能重复".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn explain_terms(
    items: Vec<ExplainTermInput>,
    language: Language,
    state: State<'_, AppState>,
) -> Result<ExplainTermsResponse, String> {
    validate_explain_inputs(&items)?;
    let cfg = config_store::load(&state.config_path).map_err(|error| error.to_string())?;
    let (provider_cfg, model_ref) = cfg
        .resolve_model(Feature::Explain)
        .map_err(|error| error.to_string())?;
    let prompt = compose_explain_prompt(cfg.prompt_overrides.explain(), language);
    let user = serde_json::to_string(
        &items
            .iter()
            .map(|item| serde_json::json!({"id": item.id, "content": item.content.trim()}))
            .collect::<Vec<_>>(),
    )
    .map_err(|error| error.to_string())?;
    let request = ChatRequest::new(
        model_ref.model.clone(),
        vec![ChatMessage::system(prompt), ChatMessage::user(user)],
    );
    let output = collect_provider_output(provider_cfg, &request, &state.rate_limit_until).await?;
    let parsed: Vec<ExplainTermOutput> =
        serde_json::from_str(&output).map_err(|_| "术语解释返回的不是 JSON 数组".to_string())?;
    let expected = items
        .iter()
        .map(|item| item.id.as_str())
        .collect::<std::collections::HashSet<_>>();
    let mut seen = std::collections::HashSet::new();
    Ok(ExplainTermsResponse {
        items: parsed
            .into_iter()
            .filter(|item| {
                expected.contains(item.id.as_str())
                    && !item.explanation.trim().is_empty()
                    && seen.insert(item.id.clone())
            })
            .collect(),
    })
}

async fn collect_provider_output(
    provider_cfg: &ProviderConfig,
    request: &ChatRequest,
    cooldown: &Mutex<Option<Instant>>,
) -> Result<String, String> {
    let mut retried = false;
    loop {
        if let Some(delay) = shared_cooldown_delay(cooldown, Instant::now()) {
            tokio::time::sleep(delay).await;
        }
        let mut output = String::new();
        // Recreate the provider for every attempt, matching chat_stream. This
        // keeps retries safe for providers whose stream clients are one-shot.
        let provider = build_provider(provider_cfg)?;
        let mut stream = provider.chat_stream(request);
        let mut retry_error: Option<LlmError> = None;
        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(chunk) => output.push_str(&chunk.delta),
                Err(error) if should_retry(!output.is_empty(), retried, &error) => {
                    retry_error = Some(error);
                    break;
                }
                Err(error) => return Err(error.to_string()),
            }
        }
        if let Some(error) = retry_error {
            retried = true;
            retry_after_zero_output_failure(&error, cooldown).await;
            continue;
        }
        if output.trim().is_empty() {
            return Err("术语解释未返回内容".into());
        }
        return Ok(output);
    }
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
            retry_after_zero_output_failure(&error, &state.rate_limit_until).await;
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

/// The shared retry boundary for streaming and collected LLM work. A 429 sets
/// the process-wide cooldown; all other retryable zero-output failures back
/// off once before their next attempt.
async fn retry_after_zero_output_failure(error: &LlmError, cooldown: &Mutex<Option<Instant>>) {
    if error.is_rate_limited() {
        extend_shared_cooldown(cooldown, Instant::now(), Duration::from_secs(1));
    } else {
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
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
    fn explain_inputs_reject_empty_duplicate_and_over_limit_batches() {
        assert!(validate_explain_inputs(&[]).is_err());
        assert!(validate_explain_inputs(&[
            ExplainTermInput {
                id: "same".into(),
                content: "Redis".into()
            },
            ExplainTermInput {
                id: "same".into(),
                content: "Kafka".into()
            },
        ])
        .is_err());
        let too_many = (0..11)
            .map(|index| ExplainTermInput {
                id: index.to_string(),
                content: "term".into(),
            })
            .collect::<Vec<_>>();
        assert!(validate_explain_inputs(&too_many).is_err());
        assert!(validate_explain_inputs(&[ExplainTermInput {
            id: "one".into(),
            content: "Redis".into()
        }])
        .is_ok());
    }

    #[tokio::test]
    async fn document_translation_retries_one_zero_output_transport_failure() {
        struct ScriptedProvider {
            attempts:
                Mutex<std::collections::VecDeque<Vec<Result<lingostack_llm::ChatChunk, LlmError>>>>,
            calls: Arc<std::sync::atomic::AtomicUsize>,
        }

        impl LlmProvider for ScriptedProvider {
            fn chat_stream<'a>(
                &'a self,
                _: &'a ChatRequest,
            ) -> futures::stream::BoxStream<'a, Result<lingostack_llm::ChatChunk, LlmError>>
            {
                self.calls.fetch_add(1, Ordering::SeqCst);
                let response = self
                    .attempts
                    .lock()
                    .unwrap()
                    .pop_front()
                    .unwrap_or_default();
                Box::pin(futures::stream::iter(response))
            }
        }

        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let provider = ScriptedProvider {
            attempts: Mutex::new(std::collections::VecDeque::from([
                vec![Err(LlmError::Network(
                    "error decoding response body".into(),
                ))],
                vec![Ok(lingostack_llm::ChatChunk {
                    delta: "translated".into(),
                })],
            ])),
            calls: Arc::clone(&calls),
        };
        let mut port = LiveDocumentPort {
            provider: Box::new(provider),
            model: "test".into(),
            prompt: "test".into(),
            target: Language::Zh,
        };

        assert_eq!(
            port.translate(DocumentTranslationRequest {
                source: "source".into()
            })
            .await
            .unwrap(),
            "translated"
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn document_translation_does_not_retry_after_any_output() {
        struct ScriptedProvider {
            attempts:
                Mutex<std::collections::VecDeque<Vec<Result<lingostack_llm::ChatChunk, LlmError>>>>,
            calls: Arc<std::sync::atomic::AtomicUsize>,
        }

        impl LlmProvider for ScriptedProvider {
            fn chat_stream<'a>(
                &'a self,
                _: &'a ChatRequest,
            ) -> futures::stream::BoxStream<'a, Result<lingostack_llm::ChatChunk, LlmError>>
            {
                self.calls.fetch_add(1, Ordering::SeqCst);
                let response = self
                    .attempts
                    .lock()
                    .unwrap()
                    .pop_front()
                    .unwrap_or_default();
                Box::pin(futures::stream::iter(response))
            }
        }

        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let provider = ScriptedProvider {
            attempts: Mutex::new(std::collections::VecDeque::from([
                vec![
                    Ok(lingostack_llm::ChatChunk {
                        delta: "partial".into(),
                    }),
                    Err(LlmError::Network("error decoding response body".into())),
                ],
                vec![Ok(lingostack_llm::ChatChunk {
                    delta: "must not run".into(),
                })],
            ])),
            calls: Arc::clone(&calls),
        };
        let mut port = LiveDocumentPort {
            provider: Box::new(provider),
            model: "test".into(),
            prompt: "test".into(),
            target: Language::Zh,
        };

        let error = port
            .translate(DocumentTranslationRequest {
                source: "source".into(),
            })
            .await
            .unwrap_err();
        assert!(error.contains("网络或连接错误"));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
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

    #[test]
    fn tts_events_serialize_for_the_typescript_ipc_mirror() {
        assert_eq!(
            serde_json::to_string(&TtsEvent::Started).unwrap(),
            r#"{"type":"started"}"#
        );
        assert_eq!(
            serde_json::to_string(&TtsEvent::Done).unwrap(),
            r#"{"type":"done"}"#
        );
        assert_eq!(
            serde_json::to_string(&TtsEvent::Error {
                message: "状态读取失败".into(),
            })
            .unwrap(),
            r#"{"type":"error","message":"状态读取失败"}"#
        );
    }

    #[test]
    fn document_request_is_structured_and_keeps_placeholders_visible() {
        let message = format_document_request(&DocumentTranslationRequest {
            source: "Use <<<LINGOSTACK_PROTECTED_0>>>".into(),
        });
        assert!(message.contains("<<<LINGOSTACK_PROTECTED_0>>>"));
        assert!(message.contains("complete normalized Markdown document"));
    }

    #[test]
    fn document_reader_ipc_types_have_a_stable_json_shape() {
        let json = serde_json::to_string(&lingostack_document::DocumentContent {
            markdown: "# translated".into(),
            complete: true,
            missing_parts: 0,
        })
        .unwrap();
        assert_eq!(
            json,
            r##"{"markdown":"# translated","complete":true,"missing_parts":0}"##
        );
        assert_eq!(
            serde_json::to_string(&DocumentView::Source).unwrap(),
            r#""source""#
        );
    }

    #[test]
    fn document_failure_snapshot_serializes_for_the_typescript_mirror() {
        let json = serde_json::to_string(&lingostack_document::DocumentSnapshot {
            id: "document-1".into(),
            file_name: "failed.md".into(),
            status: lingostack_document::DocumentStatus::Failed,
            block_count: 1,
            translated_count: 0,
            error_message: Some("provider rejected the request".into()),
        })
        .unwrap();
        assert_eq!(
            json,
            r#"{"id":"document-1","file_name":"failed.md","status":"failed","block_count":1,"translated_count":0,"error_message":"provider rejected the request"}"#
        );
    }

    #[test]
    fn durable_document_failure_reason_redacts_obvious_credentials() {
        let reason = safe_document_failure_message(
            "provider rejected Bearer very-secret-token token another-secret sk-secret api_key=also-secret https://example.invalid?key=query-secret {\"api_key\":\"json-secret\"}",
        );
        assert!(reason.contains("provider rejected Bearer"));
        assert!(!reason.contains("very-secret-token"));
        assert!(!reason.contains("another-secret"));
        assert!(!reason.contains("sk-secret"));
        assert!(!reason.contains("also-secret"));
        assert!(!reason.contains("query-secret"));
        assert!(!reason.contains("json-secret"));
    }

    #[test]
    fn durable_document_failure_reason_is_capped_at_500_characters() {
        let reason = safe_document_failure_message(&"x".repeat(501));
        assert_eq!(reason.chars().count(), 500);
        assert!(reason.ends_with('…'));
    }

    #[test]
    fn document_prompt_uses_auto_detection_and_configured_target_rules() {
        let config = AppConfig {
            global_default_target: Language::Ja,
            ..AppConfig::default()
        };
        let prompt = document_prompt(&config, "hello world");
        assert!(prompt.contains("English"));
        assert!(prompt.contains("日本語"));
        assert!(!prompt.contains("{source_lang}"));
        assert!(!prompt.contains("{target_lang}"));
    }

    #[test]
    fn document_target_language_blocks_never_reach_the_provider() {
        let request = DocumentTranslationRequest {
            source: "已是中文的整篇 Markdown 文档".into(),
        };
        assert!(should_skip_document_request(&request, Language::Zh));
        assert!(!should_skip_document_request(&request, Language::En));
    }

    #[test]
    fn paused_document_job_never_persists_a_late_provider_result() {
        let control = crate::DocumentJobControl {
            lifecycle: Mutex::new(()),
            pause_requested: AtomicBool::new(true),
            cancel_requested: AtomicBool::new(false),
        };
        assert!(!document_job_should_persist(&control));
    }

    #[test]
    fn completed_document_job_is_removed_from_running_registry() {
        let control = Arc::new(crate::DocumentJobControl {
            lifecycle: Mutex::new(()),
            pause_requested: AtomicBool::new(false),
            cancel_requested: AtomicBool::new(false),
        });
        let jobs = Mutex::new(std::collections::HashMap::from([(
            "document-1".to_owned(),
            control,
        )]));
        finish_document_job(&jobs, "document-1");
        assert!(jobs.lock().unwrap().is_empty());
    }

    #[test]
    fn document_limits_match_typescript_ipc_shape() {
        let json = serde_json::to_string(&DocumentLimits {
            max_input_bytes: 52_428_800,
            max_text_chars: 100_000,
        })
        .unwrap();
        assert_eq!(
            json,
            r#"{"max_input_bytes":52428800,"max_text_chars":100000}"#
        );
    }

    #[cfg(feature = "e2e")]
    #[tokio::test]
    async fn e2e_fixture_provider_streams_known_chunks_without_a_client() {
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
        let chunks = provider
            .chat_stream(&request)
            .map(|chunk| chunk.unwrap().delta)
            .collect::<Vec<_>>()
            .await;
        assert_eq!(chunks, vec!["确定性的 ", "E2E 翻译结果"]);
    }
}
