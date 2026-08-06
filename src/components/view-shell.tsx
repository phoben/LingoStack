import { type ReactNode } from "react";
import { VIEW_META } from "@/lib/view-meta";
import type { AppView } from "@/stores/app-store";

interface ViewShellProps {
  view: AppView;
  /** 标题右侧操作区（语言对 / 主按钮 / 搜索框等）。 */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * 视图统一外壳（原型 .panel + .panel-head）：
 * 顶部标题 + 一句话描述（取自 VIEW_META）+ 可选操作区，下方为弹性内容区。
 * 内容区为 flex-1 min-h-0，由各视图自行决定撑满或内部滚动；
 * 切换时带 panel-in 入场动画（原型 fade）。
 */
export function ViewShell({ view, actions, children }: ViewShellProps) {
  const meta = VIEW_META[view];
  return (
    <section className="flex h-full animate-panel-in flex-col overflow-hidden">
      <div className="shrink-0 px-6 pb-[18px] pt-[22px]">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[22px] font-semibold tracking-tight">
              {meta.label}
            </h2>
            <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">
              {meta.description}
            </p>
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
          ) : null}
        </header>
      </div>
      <div className="min-h-0 flex-1 px-6 pb-6">{children}</div>
    </section>
  );
}
