import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Monitor, Moon, Square, Sun, X } from "lucide-react";
import { useThemeStore, type ThemeMode } from "@/stores/theme-store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type IconType = ComponentType<{ className?: string }>;

const THEME_ICON: Record<ThemeMode, IconType> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const THEME_I18N_KEY: Record<ThemeMode, "themeLight" | "themeDark" | "themeSystem"> = {
  light: "themeLight",
  dark: "themeDark",
  system: "themeSystem",
};

interface WindowControlProps {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}

/** 窗口控制按钮（最小化 / 最大化 / 隐藏到托盘）。 */
function WindowControl({
  label,
  onClick,
  danger,
  children,
}: WindowControlProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-11 w-[44px] items-center justify-center text-muted-foreground",
        danger
          ? "hover:bg-destructive hover:text-destructive-foreground"
          : "hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * 主窗口自定义标题栏：左侧品牌标 + 产品名，右侧主题切换 + 窗口控制。
 * 配合 tauri.conf.json 的 decorations:false 实现沉浸式一体化外观。
 * 无底部分隔线——标题栏与侧栏同底色，视觉上连成一体（右侧内容区为独立圆角面板）。
 */
export function TitleBar() {
  const t = useT();
  const mode = useThemeStore((s) => s.mode);
  const cycleMode = useThemeStore((s) => s.cycleMode);
  const [maximized, setMaximized] = useState(false);

  // 跟踪最大化状态以切换「最大化 / 还原」图标
  useEffect(() => {
    const appWindow = getCurrentWindow();
    const sync = () => {
      appWindow
        .isMaximized()
        .then(setMaximized)
        .catch(() => {});
    };
    sync();
    const promise = appWindow.onResized(sync);
    return () => {
      promise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  const ThemeIcon = THEME_ICON[mode];
  const appWindow = getCurrentWindow();

  return (
    <header
      data-tauri-drag-region
      className="relative flex h-11 shrink-0 select-none items-center justify-between"
    >
      {/* 左：品牌标 + 产品名（pointer-events-none 让拖拽穿透） */}
      <div
        data-tauri-drag-region
        className="pointer-events-none flex items-center gap-2.5 pl-3.5"
      >
        <span
          className="brand-mark h-[22px] w-[22px] rounded-[6px]"
          aria-hidden="true"
        />
        <span className="text-[13px] font-bold tracking-tight text-foreground">
          译栈
        </span>
        <span className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground">
          LingoStack
        </span>
      </div>

      {/* 右：主题切换 + 窗口控制（stopPropagation 避免触发拖拽） */}
      <div
        className="flex items-center"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={cycleMode}
          title={`${t("theme")}: ${t(THEME_I18N_KEY[mode])}`}
          aria-label={`${t("theme")}: ${t(THEME_I18N_KEY[mode])}`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ThemeIcon className="h-4 w-4" />
        </button>

        <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

        <WindowControl label={t("minimize")} onClick={() => appWindow.minimize()}>
          <Minus className="h-4 w-4" />
        </WindowControl>
        <WindowControl
          label={maximized ? t("restore") : t("maximize")}
          onClick={() => appWindow.toggleMaximize()}
        >
          {maximized ? (
            <Copy className="h-3.5 w-3.5" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </WindowControl>
        <WindowControl
          label={t("close")}
          danger
          onClick={() => void appWindow.hide()}
        >
          <X className="h-4 w-4" />
        </WindowControl>
      </div>
    </header>
  );
}
