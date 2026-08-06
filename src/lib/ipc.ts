/**
 * Tauri IPC 封装：配置读写、Prompt 查询、流式聊天。
 *
 * 命令名与参数名对应 `src-tauri/src/commands.rs`。Tauri 2 会把前端 camelCase
 * 参数（如 `onEvent`）映射到 Rust snake_case（`on_event`）。
 */

import { Channel, invoke } from "@tauri-apps/api/core";
import type { AppConfig, ChatEvent, ChatMessage, Feature } from "./config-types";

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

/** 朗读文本（异步，打断上一句）。 */
export function speak(text: string): Promise<void> {
  return invoke<void>("speak", { text });
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

/** 取某功能当前生效的 Prompt（用户覆盖优先；含占位符，前端替换）。 */
export function effectivePrompt(feature: Feature): Promise<string> {
  return invoke<string>("effective_prompt", { feature });
}

/**
 * 发起流式聊天。增量 / 完成 / 错误经 `onEvent` 回调推送。
 *
 * 底层用 Tauri 2 `Channel`——比 `emit/listen` 更类型安全、更低开销。
 * 流式中断时已渲染部分保留，前端可「重试」（见设计文档 §9）。
 */
export async function chatStream(
  feature: Feature,
  messages: ChatMessage[],
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  await invoke<void>("chat_stream", { feature, messages, onEvent: channel });
}
