import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ViewShellProps {
  /**
   * 页面主操作卡片内容（语言对切换 / 主按钮 / 搜索框 / 二级标签等）。
   * 省略时不渲染卡片，内容区直接顶到面板上沿。
   */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * 视图统一外壳（原型 .panel）。
 *
 * 无标题与描述文案——页面身份由左侧导航的选中态表达。顶部改为一张轻量卡片，
 * 承载该页的核心操作，使各页操作入口位置一致；下方为弹性内容区，
 * 由各视图自行决定撑满或内部滚动。切换时带 panel-in 入场动画。
 */
export function ViewShell({ toolbar, children }: ViewShellProps) {
  return (
    <section className="flex h-full animate-panel-in flex-col overflow-hidden">
      {toolbar ? (
        <div className="shrink-0 px-4 pb-3 pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border/70 bg-background/50 px-3 py-2">
            {toolbar}
          </div>
        </div>
      ) : null}
      <div
        className={cn("min-h-0 flex-1 px-4 pb-4", toolbar ? "pt-0" : "pt-4")}
      >
        {children}
      </div>
    </section>
  );
}
