/**
 * 应用配置的 TypeScript 镜像。
 *
 * 对应 lingostack-core / lingostack-llm 的 serde 序列化形状——字段名与命名
 * 规范（snake_case / lowercase）必须与 Rust 侧一致，否则 IPC 往返失败。
 */

export type Language = "zh" | "en" | "ja";

/** LLM 提供商协议（serde `rename_all = "snake_case"`）。 */
export type ProviderKind =
  | "open_ai_compatible"
  | "anthropic"
  | "gemini"
  | "ollama";

/** AI 功能（serde snake_case）。 */
export type Feature = "translate" | "naming" | "explain" | "doc_translate";

/** 主题（serde snake_case）。 */
export type Theme = "system" | "light" | "dark";

/** 变量名命名风格（serde snake_case）。 */
export type NamingStyle =
  | "camel_case"
  | "snake_case"
  | "pascal_case"
  | "kebab_case"
  | "constant_case";

/** 热键动作（serde snake_case）。 */
export type HotkeyAction =
  | "translate_selection"
  | "show_main_window"
  | "translate_popup";

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  name: string;
  base_url: string;
  api_key: string;
  models: string[];
}

export interface ModelRef {
  provider_id: string;
  model: string;
}

export interface ModelAssignment {
  translate?: ModelRef | null;
  naming?: ModelRef | null;
  explain?: ModelRef | null;
  doc_translate?: ModelRef | null;
  global_default?: ModelRef | null;
}

export interface PromptOverrides {
  translate?: string | null;
  naming?: string | null;
  explain?: string | null;
}

export interface KeyCombo {
  /** 修饰键位标记：CTRL=1, ALT=2, SHIFT=4, SUPER=8。 */
  mods: number;
  key: string;
}

export interface HotkeyBinding {
  action: HotkeyAction;
  combo: KeyCombo;
}

export interface AppConfig {
  providers: ProviderConfig[];
  models: ModelAssignment;
  ui_language: Language;
  theme: Theme;
  pair_mappings: [Language, Language][];
  global_default_target: Language;
  hotkeys: HotkeyBinding[];
  naming_styles: NamingStyle[];
  prompt_overrides: PromptOverrides;
}

/** 聊天消息（`lingostack_llm::ChatMessage`，role serde lowercase）。 */
export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** `chat_stream` 经 Channel 推回的事件（Rust `ChatEvent`，tag=type, snake_case）。 */
export type ChatEvent =
  | { type: "chunk"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** 修饰键位常量（对应 `lingostack_core::hotkey::Modifiers`）。 */
export const MOD = {
  CTRL: 1,
  ALT: 2,
  SHIFT: 4,
  SUPER: 8,
} as const;

/** 镜像 `lingostack-core` 的默认值（`AppConfig::default` + `hotkey::defaults`）。 */
export function defaultConfig(): AppConfig {
  return {
    providers: [],
    models: {},
    ui_language: "zh",
    theme: "system",
    pair_mappings: [],
    global_default_target: "zh",
    hotkeys: [
      {
        action: "translate_popup",
        combo: { mods: MOD.CTRL | MOD.SHIFT, key: "T" },
      },
      { action: "show_main_window", combo: { mods: MOD.ALT, key: "Space" } },
      {
        action: "translate_selection",
        combo: { mods: MOD.CTRL | MOD.SHIFT, key: "D" },
      },
    ],
    naming_styles: [
      "camel_case",
      "snake_case",
      "pascal_case",
      "kebab_case",
      "constant_case",
    ],
    prompt_overrides: {},
  };
}
