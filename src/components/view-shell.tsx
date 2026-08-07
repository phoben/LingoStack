import { type ReactNode } from "react";

interface ViewShellProps {
  /**
   * 页面顶部操作行内容（语言对切换 / 主按钮 / 搜索框 / 二级标签等）。
   * 省略时不渲染该行，内容区直接顶到面板上沿。
   */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * 视图统一外壳（原型 .panel）。
 *
 * 无标题与描述文案——页面身份由左侧导航的选中态表达。
 *
 * 整个视图区只有「主面板」这一层容器（见 App.tsx 的圆角面板），内部一律用 1px
 * 浅色分割线分区，不再层层套圆角卡片：顶部操作行与内容区之间只隔一条线。
 * 故内容区不带内边距，由各视图自行决定——这样分割线才能通到面板两侧边缘，
 * 而不是悬在半空。
 */
export function ViewShell({ toolbar, children }: ViewShellProps) {
  return (
    <section className="flex h-full animate-panel-in flex-col overflow-hidden">
      {toolbar ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2.5">
          {toolbar}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}
