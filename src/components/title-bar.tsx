import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Monitor, Moon, Square, Sun, X } from "lucide-react";
import { useThemeStore, type ThemeMode } from "@/stores/theme-store";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string }>;

const THEME_ICON: Record<ThemeMode, IconType> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const THEME_LABEL: Record<ThemeMode, string> = {
  light: "浅色",
  dark: "深色",
  system: "跟随系统",
};

interface WindowControlProps {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}

/** 窗口控制按钮（最小化 / 最大化 / 关闭）。 */
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
        "flex h-10 w-11 items-center justify-center text-muted-foreground",
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
 * 主窗口自定义标题栏：拖拽区 + 应用标识 + 主题切换 + 窗口控制。
 * 配合 tauri.conf.json 的 decorations:false 实现沉浸式一体化外观。
 */
export function TitleBar() {
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
      className="flex h-10 shrink-0 select-none items-center justify-between border-b border-border bg-background"
    >
      {/* 左：应用标识（整块可拖拽） */}
      <div data-tauri-drag-region className="flex items-center gap-2 pl-3">
        <span
          data-tauri-drag-region
          className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground"
        >
          译
        </span>
        <span
          data-tauri-drag-region
          className="text-sm font-medium tracking-tight"
        >
          LingoStack · 译栈
        </span>
      </div>

      {/* 右：主题切换 + 窗口控制 */}
      {/* stopPropagation：避免按钮区的 mousedown 触发拖拽 */}
      <div
        className="flex items-center"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={cycleMode}
          title={`主题：${THEME_LABEL[mode]}`}
          aria-label={`切换主题（当前：${THEME_LABEL[mode]}）`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ThemeIcon className="h-4 w-4" />
        </button>

        <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

        <WindowControl label="最小化" onClick={() => appWindow.minimize()}>
          <Minus className="h-4 w-4" />
        </WindowControl>
        <WindowControl
          label={maximized ? "还原" : "最大化"}
          onClick={() => appWindow.toggleMaximize()}
        >
          {maximized ? (
            <Copy className="h-3.5 w-3.5" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </WindowControl>
        <WindowControl label="关闭" danger onClick={() => appWindow.close()}>
          <X className="h-4 w-4" />
        </WindowControl>
      </div>
    </header>
  );
}
