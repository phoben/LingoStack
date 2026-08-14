import type { UiLanguage } from "@/lib/config-types";
import { useConfigStore } from "@/stores/config-store";

const zh = {
  translate: "翻译", naming: "命名", docs: "文档", favorites: "收藏", settings: "设置", about: "关于",
  general: "通用", shortcuts: "热键", ai: "AI", appearance: "外观",
  loadingSettings: "正在加载设置…", languageMappings: "语言映射", mappingsHelp: "映射优先于界面语言和全局默认目标。",
  add: "添加", interfaceLanguage: "界面语言", defaultTarget: "默认目标语言", system: "跟随系统",
  globalShortcuts: "全局热键", shortcutsHelp: "按下带修饰键的组合键即可捕获，然后保存并重新注册。",
  translateSelection: "划词翻译", showMainWindow: "打开主窗口", registered: "已注册", notChecked: "尚未检查",
  saveReregister: "保存并重新注册", shortcutInvalid: "每个热键都需要修饰键和主键，且不能重复。",
  theme: "主题", prompts: "Prompt", promptsHelp: "翻译协议和术语信封始终会追加，不能被覆盖。", restoreBuiltIn: "恢复内置",
  configSaveFailed: "配置保存失败：", removeMapping: "移除 {from} 映射",
  sourceLanguage: "源语言", targetLanguage: "目标语言", autoDetect: "自动检测", byLanguageRule: "按语言规则",
  translating: "翻译中…", translateAction: "翻译", sourceText: "原文", translatedText: "译文", inputToTranslate: "输入或粘贴要翻译的文本",
  pending: "待翻译", streaming: "流式", completed: "已完成", error: "错误", retry: "重试", copy: "复制", copied: "已复制", favorite: "收藏", favorited: "已收藏", speak: "朗读",
  generate: "生成", generating: "生成中…", describeName: "用中文描述这个变量的用途", noNaming: "输入用途描述并点「生成」，一次产出五种命名规范的候选。",
  loading: "加载中…", searchFavorites: "搜索词条或释义…", importJson: "导入 JSON", exportJson: "导出 JSON", all: "全部", word: "单词", phrase: "短句", noFavorites: "还没有收藏", noMatchFavorites: "没有匹配的收藏",
  themeLight: "浅色", themeDark: "深色", themeSystem: "跟随系统",
  contextualTerms: "上下文术语", source: "原文", translation: "译文", candidate: "候选", incompleteCandidates: "仅生成 {count} 个有效候选，未完整生成 5 个候选。",
  providerName: "名称", providerProtocol: "协议", providerModels: "模型（逗号或换行分隔）", providerRequired: "名称、Base URL、API Key 为必填项", cancel: "取消", save: "保存",
  llmProviders: "LLM 提供商", providersHelp: "多提供商并存，按功能指定默认模型，全局默认兜底。仅使用你的 API Key，零内置计费。", addProvider: "添加提供商", noProvider: "尚未配置提供商。添加一个即可开始翻译。", configured: "已配置", missingKey: "缺 Key", unassigned: "未指定", featureDefault: "功能默认模型（未指定时回退到全局默认）", globalDefault: "全局默认",
  minimize: "最小化", maximize: "最大化", restore: "还原", close: "关闭", mainNavigation: "主导航", resizeSidebar: "调整导航栏宽度",
  uploadFile: "上传文件", export: "导出", delete: "删除", fileHistory: "文件历史", documentSource: "原文", documentTranslation: "译文",
  privacy: "零遥测：所有请求直连你配置的提供商，不经任何中间服务器。", crashLogs: "崩溃日志本地保存，不记录 API Key；问题反馈请前往 GitHub Issues。",
  mappingInvalid: "源语言和目标语言不能相同，且每个源语言只能映射一次。",
  hotkeyRegistrationFailed: "注册失败：",
} as const;

const en: { [K in keyof typeof zh]: string } = {
  translate: "Translate", naming: "Naming", docs: "Docs", favorites: "Favorites", settings: "Settings", about: "About",
  general: "General", shortcuts: "Shortcuts", ai: "AI", appearance: "Appearance",
  loadingSettings: "Loading settings…", languageMappings: "Language mappings", mappingsHelp: "Mappings win over UI language and the global default.",
  add: "Add", interfaceLanguage: "Interface language", defaultTarget: "Default target", system: "System",
  globalShortcuts: "Global shortcuts", shortcutsHelp: "Press a modifier combination to capture it, then save and re-register.",
  translateSelection: "Translate selection", showMainWindow: "Show main window", registered: "Registered", notChecked: "Not checked",
  saveReregister: "Save and re-register", shortcutInvalid: "Each shortcut needs modifiers, a key, and must be unique.",
  theme: "Theme", prompts: "Prompts", promptsHelp: "The translation protocol and term envelope are always appended and cannot be overridden.", restoreBuiltIn: "Restore built-in",
  configSaveFailed: "Configuration save failed: ", removeMapping: "Remove {from} mapping",
  sourceLanguage: "Source language", targetLanguage: "Target language", autoDetect: "Auto detect", byLanguageRule: "By language rule",
  translating: "Translating…", translateAction: "Translate", sourceText: "Source", translatedText: "Translation", inputToTranslate: "Enter or paste text to translate",
  pending: "Ready", streaming: "Streaming", completed: "Complete", error: "Error", retry: "Retry", copy: "Copy", copied: "Copied", favorite: "Favorite", favorited: "Favorited", speak: "Speak",
  generate: "Generate", generating: "Generating…", describeName: "Describe this variable in Chinese", noNaming: "Describe the purpose and click Generate to create five naming-style candidates.",
  loading: "Loading…", searchFavorites: "Search terms or meanings…", importJson: "Import JSON", exportJson: "Export JSON", all: "All", word: "Words", phrase: "Phrases", noFavorites: "No favorites yet", noMatchFavorites: "No matching favorites",
  themeLight: "Light", themeDark: "Dark", themeSystem: "System",
  contextualTerms: "Contextual terms", source: "Source", translation: "Translation", candidate: "candidate", incompleteCandidates: "Only {count} valid candidates were generated; fewer than five are available.",
  providerName: "Name", providerProtocol: "Protocol", providerModels: "Models (comma or newline separated)", providerRequired: "Name, Base URL, and API Key are required", cancel: "Cancel", save: "Save",
  llmProviders: "LLM providers", providersHelp: "Keep multiple providers and choose per-feature defaults with a global fallback. Your API key is used directly.", addProvider: "Add provider", noProvider: "No provider configured. Add one to start translating.", configured: "Configured", missingKey: "Missing key", unassigned: "Unassigned", featureDefault: "Feature default model (falls back to global default)", globalDefault: "Global default",
  minimize: "Minimize", maximize: "Maximize", restore: "Restore", close: "Close", mainNavigation: "Main navigation", resizeSidebar: "Resize sidebar",
  uploadFile: "Upload file", export: "Export", delete: "Delete", fileHistory: "File history", documentSource: "Source", documentTranslation: "Translation",
  privacy: "Zero telemetry: requests go directly to your configured provider, with no intermediary server.", crashLogs: "Crash logs stay on this device and never record API keys; report issues on GitHub Issues.",
  mappingInvalid: "Source and target cannot be the same, and each source language may be mapped only once.",
  hotkeyRegistrationFailed: "Registration failed: ",
};

export type I18nKey = keyof typeof zh;

/** `system` chooses Chinese only for a Chinese browser locale; all others use English. */
export function resolveLocale(mode: UiLanguage, language = navigator.language): "zh" | "en" {
  return mode === "zh" || (mode === "system" && language.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

export function t(mode: UiLanguage, key: I18nKey, values: Record<string, string> = {}): string {
  return (resolveLocale(mode) === "zh" ? zh : en)[key].replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}

/** Reactive UI translation helper. Configuration is the persisted source of truth. */
export function useT() {
  const mode = useConfigStore((state) => state.config?.ui_language ?? "system");
  return (key: I18nKey, values?: Record<string, string>) => t(mode, key, values);
}
