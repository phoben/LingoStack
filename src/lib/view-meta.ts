import { type ComponentType } from "react";
import {
  Bookmark,
  Braces,
  FileText,
  Info,
  Languages,
  Settings,
} from "lucide-react";
import type { AppView } from "@/stores/app-store";

type IconType = ComponentType<{ className?: string }>;

/**
 * 视图标签页元数据（设计文档 §12.4 / §3，对齐原型 main-window.html）。
 * 侧边栏导航与各视图标题共用，确保文案与图标单一来源。
 */
export interface ViewMeta {
  id: AppView;
  /** 侧边栏 / 标题栏展示名。 */
  label: string;
  /** 一句话职责描述，用于视图头部与无障碍说明。 */
  description: string;
  icon: IconType;
}

/**
 * 侧边栏自上而下的展示顺序。
 * 原型为六标签：翻译 / 命名 / 文档 / 收藏 / 设置 / 关于。
 */
export const VIEW_ORDER: readonly AppView[] = [
  "translate",
  "naming",
  "docs",
  "favorites",
  "settings",
  "about",
];

export const VIEW_META: Record<AppView, ViewMeta> = {
  translate: {
    id: "translate",
    label: "翻译",
    description: "粘贴或输入文本，源语言自动识别，译文遵循开发行业语言流式渲染。",
    icon: Languages,
  },
  naming: {
    id: "naming",
    label: "命名",
    description: "输入中文描述，按命名规范即时生成多个候选，一键复制。",
    icon: Braces,
  },
  docs: {
    id: "docs",
    label: "文档",
    description: "文档翻译（§3 场景 4 · P1）。",
    icon: FileText,
  },
  favorites: {
    id: "favorites",
    label: "收藏",
    description: "保存的单词与短句，可搜索、朗读、导出导入 JSON。",
    icon: Bookmark,
  },
  settings: {
    id: "settings",
    label: "设置",
    description: "通用偏好、热键、AI 提供商与 Prompt、外观主题。",
    icon: Settings,
  },
  about: {
    id: "about",
    label: "关于",
    description: "版本、开源协议与隐私承诺。",
    icon: Info,
  },
};
