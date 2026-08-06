/**
 * 主窗口底部状态栏（原型 .statusbar）：
 * 左：就绪指示灯；中：当前模型；右：资源占用。
 * V0 阶段为静态占位，V1 接入真实就绪状态 / 模型 / 资源遥测（本地）。
 */
export function StatusBar() {
  return (
    <footer className="flex shrink-0 items-center gap-4 border-t border-border bg-background/40 px-4 py-2 font-mono text-[10px] text-muted-foreground/80">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
        就绪
      </span>
      <span>模型：DeepSeek · deepseek-chat</span>
      <span className="ml-auto">内存 84MB · CPU 0%</span>
    </footer>
  );
}
