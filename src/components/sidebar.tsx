import { useAppStore } from "@/stores/app-store";
import { VIEW_META, VIEW_ORDER } from "@/lib/view-meta";
import { cn } from "@/lib/utils";

/**
 * 主窗口左侧导航（原型 .sidebar，188px）：
 * 顶部斜纹品牌标 + 六个导航项 + 底部「托盘常驻·零遥测」信息。
 * 活跃项以弱填充 + 左侧竖条指示，克制无投影。
 */
export function Sidebar() {
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);

  return (
    <aside className="flex w-[188px] shrink-0 flex-col border-r border-border bg-background/40 px-2.5 py-3">
      {/* 品牌 */}
      <div className="flex items-center gap-2.5 px-2 pb-4 pt-1.5 text-[15px] font-bold tracking-tight">
        <span className="brand-mark h-6 w-6 rounded-[7px]" aria-hidden="true" />
        <span>译栈</span>
      </div>

      {/* 导航 */}
      <nav aria-label="主导航" className="flex flex-col gap-0.5">
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
              title={meta.description}
              className={cn(
                "relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors duration-fast ease-app",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute -left-2.5 bottom-2 top-2 w-0.5 rounded-full bg-foreground/50"
                />
              ) : null}
              <Icon className="h-[17px] w-[17px] shrink-0" />
              <span>{meta.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 底部信息 */}
      <div className="mt-auto border-t border-border px-2 pt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground/70">
        托盘常驻 · 零遥测
        <br />
        v1.0.0 · MIT
      </div>
    </aside>
  );
}
