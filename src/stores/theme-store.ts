import { create } from "zustand";
import { saveConfig } from "@/lib/ipc";
import { useConfigStore } from "@/stores/config-store";

/** 主题模式：浅色 / 深色 / 跟随系统。 */
export type ThemeMode = "light" | "dark" | "system";

/**
 * localStorage 键名。index.html 的防闪烁脚本读同一键，
 * 保证首屏渲染前 <html> 已挂上正确的 .dark 类。
 */
export const THEME_STORAGE_KEY = "lingostack.theme";

/** 循环切换顺序：light → dark → system → light。 */
const CYCLE_ORDER: readonly ThemeMode[] = ["light", "dark", "system"];

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(raw)) return raw;
  } catch {
    // localStorage 不可用（隐私模式等）→ 回退到 system
  }
  return "system";
}

interface ThemeState {
  /** 当前主题模式。 */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** 循环切换：light → dark → system → light。 */
  cycleMode: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: readStoredMode(),
  setMode: (mode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // 写入失败时退化为仅内存态，不影响本次使用
    }
    set({ mode });
    const config = useConfigStore.getState().config;
    if (config) {
      void saveConfig({ ...config, theme: mode }).catch(() => {
        // 配置 store 保留当前输入并展示错误；主题缓存仍保证本次会话一致。
        useConfigStore.setState({ error: "主题保存失败" });
      });
      useConfigStore.setState({ config: { ...config, theme: mode } });
    }
  },
  cycleMode: () => {
    const idx = CYCLE_ORDER.indexOf(get().mode);
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
    get().setMode(next);
  },
}));
