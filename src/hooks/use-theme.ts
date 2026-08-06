import { useEffect } from "react";
import { useThemeStore, type ThemeMode } from "@/stores/theme-store";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** 系统当前是否偏好深色。 */
function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** 将模式 + 系统偏好解析为实际的明 / 暗。 */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return systemPrefersDark() ? "dark" : "light";
  }
  return mode;
}

/**
 * 在应用根节点调用一次：把 store 中的 mode 同步到 <html> 的 .dark 类；
 * mode === "system" 时监听系统主题变化实时跟随。
 */
export function useApplyTheme(): void {
  const mode = useThemeStore((s) => s.mode);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.classList.toggle("dark", resolveTheme(mode) === "dark");
    };
    apply();

    if (mode !== "system") return;

    const mql = window.matchMedia(DARK_QUERY);
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [mode]);
}
