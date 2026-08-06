import { create } from "zustand";

/**
 * 主窗口的六个视图标签页（设计文档 §12.4，对齐原型 main-window.html）。
 * 顺序即侧边栏自上而下的展示顺序。
 */
export type AppView =
  | "translate"
  | "naming"
  | "docs"
  | "favorites"
  | "settings"
  | "about";

interface AppState {
  /** V0 占位字段：证明 Zustand 链路连通，V1 接入真实应用就绪状态。 */
  ready: boolean;
  setReady: (ready: boolean) => void;

  /** 当前激活的视图标签页，默认「翻译」。 */
  activeView: AppView;
  setActiveView: (view: AppView) => void;
}

export const useAppStore = create<AppState>((set) => ({
  ready: false,
  setReady: (ready) => set({ ready }),
  activeView: "translate",
  setActiveView: (activeView) => set({ activeView }),
}));
