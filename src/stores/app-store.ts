import { create } from "zustand";

/**
 * V0 占位 store：证明 Zustand 链路连通。
 * V1 替换为真实的翻译 / 设置 / 收藏 store。
 */
interface AppState {
  /** 占位字段。 */
  ready: boolean;
  setReady: (ready: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  ready: false,
  setReady: (ready) => set({ ready }),
}));
