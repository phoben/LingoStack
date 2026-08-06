import { type ReactNode, useEffect, useRef, useState } from "react";
import { Bookmark, Copy, Sparkles, Volume2 } from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** 预设译文片段：keep 标记的开发术语不予翻译（§翻译质量）。 */
interface Part {
  s: string;
  keep?: boolean;
}

const SOURCE_TEXT =
  "The graceful shutdown handler waits for in-flight requests to complete before terminating the process, with a configurable timeout to force-exit if they hang.";

const TRANSLATION: Part[] = [
  { s: "优雅停机处理器会等待 " },
  { s: "in-flight", keep: true },
  { s: " 请求完成后再终止进程，并设有可配置的 " },
  { s: "timeout", keep: true },
  { s: "，在请求卡住时强制退出。" },
];

const TOTAL = TRANSLATION.reduce((n, p) => n + p.s.length, 0);

/** 面板标签栏（原型 .pane-label）。 */
function PaneLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3.5 py-2 font-mono text-xs text-muted-foreground">
      {children}
    </div>
  );
}

/** 面板底栏（原型 .pane-foot）。 */
function PaneFoot({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-t border-border bg-background/40 px-3 py-2">
      {children}
    </div>
  );
}

/** 按已揭示字符数渲染译文，保留词以 info 色高亮（还原原型流式揭示）。 */
function renderParts(parts: Part[], count: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let left = count;
  parts.forEach((p, i) => {
    if (left <= 0) return;
    let text: string;
    if (p.s.length <= left) {
      text = p.s;
      left -= p.s.length;
    } else {
      text = p.s.slice(0, left);
      left = 0;
    }
    nodes.push(
      p.keep ? (
        <span
          key={i}
          className="rounded bg-info/10 px-[5px] py-px font-mono text-xs text-info"
        >
          {text}
        </span>
      ) : (
        <span key={i}>{text}</span>
      ),
    );
  });
  return nodes;
}

/**
 * 翻译视图（§3 场景 2，对齐原型翻译 panel）：
 * 双 pane（原文 / 译文）+ 语言对 + 字符计数 + 模拟流式渲染。
 * 真实 LLM 流式、朗读、收藏、复制留待 V1。
 */
export function TranslateView() {
  const [source, setSource] = useState(SOURCE_TEXT);
  const [count, setCount] = useState(TOTAL);
  const [done, setDone] = useState(true);
  const timer = useRef<number>(0);

  // 模拟流式：逐字揭示预设译文，还原原型流式视觉（V1 接真实 SSE）
  const stream = () => {
    let n = 0;
    setDone(false);
    setCount(0);
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      n += 2;
      if (n >= TOTAL) {
        n = TOTAL;
        window.clearInterval(timer.current);
        setDone(true);
      }
      setCount(n);
    }, 24);
  };

  useEffect(() => () => window.clearInterval(timer.current), []);

  return (
    <ViewShell view="translate">
      <div className="grid h-full grid-cols-2 gap-3.5">
        {/* 原文 */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
          <PaneLabel>
            <span>原文</span>
            <span className="flex-1" aria-hidden="true" />
            <Select
              aria-label="源语言"
              defaultValue="auto"
              className="h-8 w-[124px] text-xs"
            >
              <option value="auto">自动检测</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </Select>
          </PaneLabel>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="输入或粘贴要翻译的文本"
            className="min-h-0 flex-1 resize-none bg-transparent px-3.5 py-3.5 text-sm leading-7 text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <PaneFoot>
            <span className="font-mono text-[10px] text-muted-foreground">
              {source.length} 字符
            </span>
            <Button size="sm" onClick={stream} title="V1 实装">
              <Sparkles className="h-3.5 w-3.5" />
              翻译
            </Button>
          </PaneFoot>
        </section>

        {/* 译文 */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
          <PaneLabel>
            <span>译文</span>
            <span className="flex-1" aria-hidden="true" />
            <span
              className={cn(
                "inline-flex items-center gap-1 font-mono text-[10px]",
                done ? "text-success" : "text-info",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  done ? "bg-success" : "animate-pulse bg-info",
                )}
              />
              {done ? "已完成" : "流式"}
            </span>
            <Select
              aria-label="目标语言"
              defaultValue="zh"
              className="h-8 w-[110px] text-xs"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </Select>
          </PaneLabel>
          <div className="min-h-0 flex-1 overflow-auto px-3.5 py-3.5 text-sm leading-7 text-foreground">
            {renderParts(TRANSLATION, count)}
            {!done ? (
              <span className="ml-px inline-block h-[1.05em] w-0.5 animate-pulse bg-info align-middle" />
            ) : null}
          </div>
          <PaneFoot>
            <span className="font-mono text-[10px] text-muted-foreground">
              DeepSeek · deepseek-chat
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" title="V1 实装" aria-label="朗读译文">
                <Volume2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" title="V1 实装" aria-label="收藏译文">
                <Bookmark className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" title="V1 实装" aria-label="复制译文">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </PaneFoot>
        </section>
      </div>
    </ViewShell>
  );
}
