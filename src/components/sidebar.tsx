import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { useLayoutStore } from "@/stores/layout-store";
import { VIEW_META, VIEW_ORDER } from "@/lib/view-meta";
import {
  SIDEBAR_KEYBOARD_STEP,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  showsSidebarLabels,
} from "@/lib/sidebar-layout";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * 主窗口左侧导航（原型 .sidebar，默认 188px）。
 *
 * 宽度可由右缘分隔条拖拽调整并持久化（layout-store）；宽度低于阈值时
 * 自动收为纯图标态，无独立折叠开关。底部留一块空白区域，供后续放置
 * 更新提示。品牌标已上移至标题栏，此处不再重复。
 */
export function Sidebar() {
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const width = useLayoutStore((s) => s.sidebarWidth);
  const setWidth = useLayoutStore((s) => s.setSidebarWidth);
  const toggleWidth = useLayoutStore((s) => s.toggleSidebarWidth);
  const [dragging, setDragging] = useState(false);
  const t = useT();
  const asideRef = useRef<HTMLElement>(null);

  const showLabels = showsSidebarLabels(width);

  // 拖拽期间在 window 上监听，指针移出侧栏也能继续跟随。
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0;
      setWidth(e.clientX - left);
    };
    const stop = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging, setWidth]);

  // 键盘可调宽度：左右方向键微调，Home / End 直达两端。
  const onHandleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey
        ? SIDEBAR_KEYBOARD_STEP * 2
        : SIDEBAR_KEYBOARD_STEP;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setWidth(width - step);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setWidth(width + step);
      } else if (e.key === "Home") {
        e.preventDefault();
        setWidth(SIDEBAR_MIN_WIDTH);
      } else if (e.key === "End") {
        e.preventDefault();
        setWidth(SIDEBAR_MAX_WIDTH);
      }
    },
    [setWidth, width],
  );

  return (
    <aside
      ref={asideRef}
      style={{ width: clampSidebarWidth(width) }}
      className="relative flex shrink-0 flex-col pb-1 pt-0.5"
    >
      <nav
        aria-label={t("mainNavigation")}
        className={cn(
          "flex flex-col gap-0.5",
          showLabels ? "pl-1.5 pr-1" : "px-1",
        )}
      >
        {VIEW_ORDER.map((id) => {
          const meta = VIEW_META[id];
          const Icon = meta.icon;
          const active = id === activeView;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveView(id)}
              aria-current={active ? "page" : undefined}
              title={showLabels ? meta.description : t(id)}
              className={cn(
                "relative flex w-full items-center rounded-md py-2 text-left text-sm font-medium transition-colors duration-fast ease-app",
                showLabels ? "gap-2.5 px-2.5" : "justify-center px-0",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-2 top-2 w-0.5 rounded-full bg-foreground/50",
                    showLabels ? "-left-1" : "left-0.5",
                  )}
                />
              ) : null}
              <Icon className="h-[17px] w-[17px] shrink-0" />
              {showLabels ? (
                <span className="truncate">{t(id)}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* 预留区域：后续放版本更新提示。当前留白，无内容不占视觉重量。 */}
      <div className="mt-auto min-h-8" aria-hidden="true" />

      {/* 宽度分隔条：拖拽调宽，双击在图标态与默认宽度间切换 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("resizeSidebar")}
        aria-valuenow={clampSidebarWidth(width)}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDoubleClick={toggleWidth}
        onKeyDown={onHandleKeyDown}
        className={cn(
          "group absolute inset-y-3 -right-1.5 z-10 w-3 cursor-col-resize rounded-full",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors duration-fast",
            dragging
              ? "bg-info/70"
              : "bg-transparent group-hover:bg-foreground/25",
          )}
        />
      </div>
    </aside>
  );
}
