import { create } from "zustand";
import {
  SIDEBAR_DEFAULT_WIDTH,
  clampSidebarWidth,
  showsSidebarLabels,
  toggledSidebarWidth,
} from "@/lib/sidebar-layout";

/** localStorage 键名：侧栏宽度跨会话保留用户的拖拽结果。 */
export const SIDEBAR_WIDTH_STORAGE_KEY = "lingostack.sidebarWidth";

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (raw != null) return clampSidebarWidth(Number.parseFloat(raw));
  } catch {
    // localStorage 不可用（隐私模式等）→ 回退到默认宽度
  }
  return SIDEBAR_DEFAULT_WIDTH;
}

interface LayoutState {
  /** 侧栏当前宽度（px），已收敛到合法区间。 */
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  /** 在「最窄图标态」与「默认宽度」间切换（双击分隔条）。 */
  toggleSidebarWidth: () => void;
  /** 当前宽度是否展示导航文字。 */
  sidebarLabelsVisible: () => boolean;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  sidebarWidth: readStoredWidth(),
  setSidebarWidth: (width) => {
    const next = clampSidebarWidth(width);
    try {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next));
    } catch {
      // 写入失败时退化为仅内存态，不影响本次使用
    }
    set({ sidebarWidth: next });
  },
  toggleSidebarWidth: () => {
    get().setSidebarWidth(toggledSidebarWidth(get().sidebarWidth));
  },
  sidebarLabelsVisible: () => showsSidebarLabels(get().sidebarWidth),
}));
