import { useState } from "react";
import { Check, Copy, RotateCcw, Sparkles } from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { effectivePrompt } from "@/lib/ipc";
import { NAMING_STYLE_LABEL } from "@/lib/config-types";
import { GRID_ROWS, GRID_STYLES, buildNamingGrid } from "@/lib/naming";
import { useStreamStore } from "@/stores/stream-store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * 命名视图（§3 场景 3）：顶部描述输入 + 生成按钮，结果按五列平铺。
 * 五列靠竖向分割线分隔、行间靠横线分隔，不各自成卡片——全页只有主面板一层容器。
 *
 * 一次生成只发一次模型请求，取回若干「中性候选词」（小写空格分隔的英文词组），
 * 五种写法在本地铺开（见 lib/case-convert）。因此五列严格逐行对齐——同一行是
 * 同一个词的五种形态，用户先横向挑词、再按当前语言取对应那一列。
 *
 * 任务态存在 stream-store 而非组件内：切到别的页面再回来，进行中的生成
 * 不中断、已产出的内容不丢失。
 */
export function NamingView() {
  const task = useStreamStore((s) => s.tasks.naming);
  const setInput = useStreamStore((s) => s.setInput);
  const start = useStreamStore((s) => s.start);
  const [copied, setCopied] = useState<string | null>(null);
  const t = useT();

  const streaming = task.status === "streaming";
  const grid = buildNamingGrid(task.output);
  const rows = Array.from({ length: GRID_ROWS }, (_, index) => grid[index]);

  const generate = () => {
    void start("naming", task.input, async () => {
      const system = await effectivePrompt("naming");
      return [
        { role: "system", content: system },
        { role: "user", content: task.input },
      ];
    });
  };

  // 复制反馈用「列+行」复合键：同一个词在不同列的按钮不会一起亮起。
  const copy = (key: string, name: string) => {
    void navigator.clipboard.writeText(name);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <ViewShell
      toolbar={
        <div className="flex w-full items-center gap-2.5">
          <Input
            value={task.input}
            onChange={(e) => setInput("naming", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") generate();
            }}
            placeholder={t("describeName")}
            aria-label={t("describeName")}
            className="h-8 flex-1 text-xs"
          />
          <Button
            size="sm"
            onClick={generate}
            disabled={streaming || !task.input.trim()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {streaming ? t("generating") : t("generate")}
          </Button>
        </div>
      }
    >
      <div
        aria-live="polite"
        aria-busy={streaming}
        className="flex h-full min-h-0 flex-col"
      >
        {grid.length === 0 && task.status !== "error" ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            {streaming
              ? t("generating")
              : t("noNaming")}
          </p>
        ) : null}

        {grid.length > 0 ? (
          <div className="grid min-h-0 grid-cols-5 divide-x divide-border overflow-auto">
            {GRID_STYLES.map((style) => (
              <section key={style} className="flex min-w-0 flex-col">
                <h3 className="border-b border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  {NAMING_STYLE_LABEL[style]}
                </h3>
                <div className="divide-y divide-border">
                  {rows.map((row, i) => {
                    const name = row?.[style];
                    const key = `${style}:${i}`;
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-1.5 px-3 py-2.5 transition-colors duration-fast hover:bg-accent/40"
                      >
                        <span className="min-w-0 flex-1 break-all font-mono text-[13px] font-medium text-foreground">
                          {name ?? "—"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          title={copied === key ? t("copied") : `${t("copy")} ${name ?? t("candidate")}`}
                          aria-label={`${t("copy")} ${name ?? t("candidate")}`}
                          onClick={() => name && copy(key, name)}
                          disabled={!name}
                        >
                          {copied === key ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {task.status === "done" && grid.length > 0 && grid.length < GRID_ROWS ? (
          <p className="border-t border-border px-4 py-2 text-xs text-accent">
          {t("incompleteCandidates", { count: String(grid.length) })}
          </p>
        ) : null}

        {task.status === "error" ? (
          <div
            role="alert"
            className={cn(
              "flex items-center gap-2 px-4 py-3",
              grid.length > 0 && "border-t border-border",
            )}
          >
            <span className="text-xs text-accent">{task.error}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={generate}
            >
              <RotateCcw className="h-3.5 w-3.5" />
                  {t("retry")}
            </Button>
          </div>
        ) : null}
      </div>
    </ViewShell>
  );
}
