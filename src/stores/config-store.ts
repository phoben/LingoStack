import { create } from "zustand";

import type { AppConfig } from "@/lib/config-types";
import { loadConfig, saveConfig } from "@/lib/ipc";
import { stringifyError } from "@/lib/utils";

interface ConfigState {
  config: AppConfig | null;
  loading: boolean;
  /** 最近一次加载 / 保存错误（无错为 null）。 */
  error: string | null;
  /** 从后端加载配置。 */
  load: () => Promise<void>;
  /**
   * 以更新函数改动配置并自动存盘（乐观更新：先改本地，再 save）。
   * 保存失败时记录 error，不回滚——配置改动低频，失败提示即可。
   */
  update: (updater: (cfg: AppConfig) => AppConfig) => Promise<void>;
  /** Clears an error that has already been presented by an explicit save action. */
  clearError: () => void;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const config = await loadConfig();
      set({ config, loading: false });
    } catch (e) {
      set({ loading: false, error: stringifyError(e) });
    }
  },
  update: async (updater) => {
    const current = get().config;
    if (!current) {
      set({ error: "配置尚未加载，无法更新" });
      return;
    }
    // 深拷贝再交给 updater，防止误 mutate 当前引用。
    const next = updater(structuredClone(current));
    set({ config: next, error: null });
    try {
      await saveConfig(next);
    } catch (e) {
      set({ error: stringifyError(e) });
    }
  },
  clearError: () => set({ error: null }),
}));
