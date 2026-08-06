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

  /**
   * 待注入翻译视图的原文（热键划词触发时由 App 写入）。
   * 翻译视图消费后清空，故非空即「有一次待执行的翻译」。
   */
  injectSource: string | null;
  setInjectSource: (source: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  ready: false,
  setReady: (ready) => set({ ready }),
  activeView: "translate",
  setActiveView: (activeView) => set({ activeView }),
  injectSource: null,
  setInjectSource: (injectSource) => set({ injectSource }),
}));
