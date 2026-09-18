/**
 * Tauri IPC 封装：配置读写、Prompt 查询、流式聊天。
 *
 * 命令名与参数名对应 `src-tauri/src/commands.rs`。Tauri 2 会把前端 camelCase
 * 参数（如 `onEvent`）映射到 Rust snake_case（`on_event`）。
 */

import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  ChatEvent,
  ChatMessage,
  Feature,
  HotkeyBinding,
  Language,
  TranslationPlan,
  ProviderConfig,
} from "./config-types";
import type {
  DocumentContent,
  DocumentLimits,
  DocumentSnapshot,
  DocumentView,
  ImportOutcome,
} from "./document-types";

export interface ExplainTermInput {
  id: string;
  content: string;
}
export interface ExplainTermOutput {
  id: string;
  explanation: string;
}
export interface ExplainTermsResponse {
  items: ExplainTermOutput[];
}

export function explainTerms(
  items: ExplainTermInput[],
  language: "zh" | "en",
): Promise<ExplainTermsResponse> {
  return invoke<ExplainTermsResponse>("explain_terms", { items, language });
}

/** 取词来源：辅助 API 直读，或降级自剪贴板。 */
export type SelectionSource = "accessibility" | "clipboard";

export interface SystemSelection {
  text: string;
  source: SelectionSource;
}

/** 读取当前系统选中文本（UIA 优先，失败降级剪贴板）。 */
export function getSelection(): Promise<SystemSelection> {
  return invoke<SystemSelection>("get_selection");
}

export type TtsEvent =
  { type: "started" } | { type: "done" } | { type: "error"; message: string };

/** 朗读文本（异步，打断上一句）；播放状态经请求级 Channel 回传。 */
export function speak(
  text: string,
  onEvent: (event: TtsEvent) => void,
): Promise<void> {
  const channel = new Channel<TtsEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("speak", { text, onEvent: channel });
}

/** 停止当前朗读。 */
export function stopSpeaking(): Promise<void> {
  return invoke<void>("stop_speaking");
}

/** 加载应用配置（文件不存在时后端返回默认值）。 */
export function loadConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("load_config");
}

/** 保存应用配置（Unix 权限 0600）。 */
export function saveConfig(cfg: AppConfig): Promise<void> {
  return invoke<void>("save_config", { cfg });
}

export interface ProviderPreset {
  id: string;
  brand: string;
  display_name: string;
  protocol: ProviderConfig["protocol"];
  suggested_endpoints: string[];
  auth: ProviderConfig["auth"];
  docs_url: string;
  discovery: "open_ai" | "anthropic" | "gemini" | "ollama_tags" | null;
  initial_model_ids: string[];
}
/** 读取随应用发布的公开预设；不会发送密钥。 */
export function listProviderPresets(): Promise<ProviderPreset[]> {
  return invoke<ProviderPreset[]>("list_provider_presets");
}
/** 后端复制预设为可编辑且独立的本地草稿。 */
export function instantiateProviderPreset(
  presetId: string,
): Promise<ProviderConfig> {
  return invoke<ProviderConfig>("instantiate_provider_preset", { presetId });
}
/** 用户显式触发的模型发现；调用不保存或覆盖配置。 */
export function discoverProviderModels(
  provider: ProviderConfig,
): Promise<ProviderConfig["models"]> {
  return invoke<ProviderConfig["models"]>("discover_provider_models", {
    provider,
  });
}

export interface HotkeyStatus {
  action: HotkeyBinding["action"];
  accelerator: string;
  registered: boolean;
  error?: string;
}

/** 保存并重新注册本应用热键，返回每项实际注册状态。 */
export function registerHotkeys(
  bindings: HotkeyBinding[],
): Promise<HotkeyStatus[]> {
  return invoke<HotkeyStatus[]>("register_hotkeys", { bindings });
}

/** 取某功能当前生效的 Prompt（用户覆盖优先；含占位符，前端替换）。 */
export function effectivePrompt(feature: Feature): Promise<string> {
  return invoke<string>("effective_prompt", { feature });
}

export function translationPlan(
  text: string,
  sourceOverride?: Language,
  targetOverride?: Language,
  effectiveSystemLanguage?: Language,
): Promise<TranslationPlan> {
  return invoke<TranslationPlan>("translation_plan", {
    text,
    sourceOverride,
    targetOverride,
    effectiveSystemLanguage,
  });
}

export function effectiveTranslationPrompt(
  source: Language,
  target: Language,
  explanationLanguage: Language,
): Promise<string> {
  return invoke<string>("effective_translation_prompt", {
    source,
    target,
    explanationLanguage,
  });
}

/**
 * 发起流式聊天。增量 / 完成 / 错误经 `onEvent` 回调推送。
 *
 * 底层用 Tauri 2 `Channel`——比 `emit/listen` 更类型安全、更低开销。
 * 流式中断时已渲染部分保留，前端可「重试」（见设计文档 §9）。
 */
export async function chatStream(
  requestId: string,
  feature: Feature,
  messages: ChatMessage[],
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  await invoke<void>("chat_stream", {
    requestId,
    feature,
    messages,
    onEvent: channel,
  });
}

/** 取消指定流式请求；请求不存在或已结束时仍成功。 */
export function cancelChat(requestId: string): Promise<void> {
  return invoke<void>("cancel_chat", { requestId });
}

/** 调用系统本地 OCR；图片字节只随本次 IPC 传递。 */
export function recognizeImage(
  requestId: string,
  mediaType: string,
  sourceOverride: Language | undefined,
  content: Uint8Array,
): Promise<string> {
  return invoke<string>("recognize_image", {
    requestId,
    mediaType,
    sourceOverride,
    content: Array.from(content),
  });
}

/** 取消指定 OCR 请求；请求不存在或已结束时仍成功。 */
export function cancelOcr(requestId: string): Promise<void> {
  return invoke<void>("cancel_ocr", { requestId });
}

export function listDocuments(): Promise<DocumentSnapshot[]> {
  return invoke<DocumentSnapshot[]>("list_documents");
}
export function documentLimits(): Promise<DocumentLimits> {
  return invoke<DocumentLimits>("document_limits");
}
export function importDocument(
  fileName: string,
  content: Uint8Array,
): Promise<ImportOutcome> {
  return invoke<ImportOutcome>("import_document", {
    fileName,
    content: Array.from(content),
  });
}
export function documentContent(
  documentId: string,
  view: DocumentView,
): Promise<DocumentContent> {
  return invoke<DocumentContent>("document_content", { documentId, view });
}
export function deleteDocument(documentId: string): Promise<void> {
  return invoke<void>("delete_document", { documentId });
}
export function translateDocument(documentId: string): Promise<void> {
  return invoke<void>("translate_document", { documentId });
}
export function pauseDocument(documentId: string): Promise<void> {
  return invoke<void>("pause_document", { documentId });
}
export function cancelDocument(documentId: string): Promise<void> {
  return invoke<void>("cancel_document", { documentId });
}
