import { useMemo, useState } from "react";
import { Bookmark, Search, Trash2, Volume2 } from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FavKind = "word" | "phrase";

interface Fav {
  term: string;
  meaning: string;
  kind: FavKind;
  src: string;
}

/** 静态示例数据，V1 接 IndexedDB。 */
const FAVS: Fav[] = [
  { term: "idempotent", meaning: "幂等：多次执行结果一致", kind: "word", src: "划词" },
  { term: "concurrency", meaning: "并发：同时应对多件事", kind: "word", src: "解释" },
  {
    term: "graceful shutdown",
    meaning: "优雅停机：平滑退出而非强杀",
    kind: "phrase",
    src: "文档",
  },
  { term: "backpressure", meaning: "背压：下游来不及处理时反压上游", kind: "word", src: "翻译" },
  {
    term: "race condition",
    meaning: "竞态条件：并发访问导致结果不确定",
    kind: "phrase",
    src: "划词",
  },
  { term: "middleware", meaning: "中间件：请求链路中的处理层", kind: "word", src: "翻译" },
  {
    term: "idempotency key",
    meaning: "幂等键：确保重复请求不重复扣款",
    kind: "phrase",
    src: "收藏",
  },
];

const FILTERS: { id: "all" | FavKind; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "word", label: "单词" },
  { id: "phrase", label: "短句" },
];

/**
 * 收藏视图（§3 场景 5，对齐原型收藏 panel）：
 * 搜索 + 类型过滤 + 列表 + 导入导出。数据接入（IndexedDB）留待 V1。
 */
export function FavoritesView() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | FavKind>("all");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return FAVS.filter((f) => {
      if (filter !== "all" && f.kind !== filter) return false;
      if (!needle) return true;
      return (
        f.term.toLowerCase().includes(needle) ||
        f.meaning.toLowerCase().includes(needle)
      );
    });
  }, [q, filter]);

  return (
    <ViewShell
      view="favorites"
      actions={
        <>
          <Button variant="outline" size="sm" title="V1 实装">
            导入 JSON
          </Button>
          <Button variant="outline" size="sm" title="V1 实装">
            导出 JSON
          </Button>
        </>
      }
    >
      <div className="flex h-full flex-col">
        <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
          <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-sm border border-input bg-background px-3 py-1.5 text-muted-foreground focus-within:border-transparent focus-within:ring-2 focus-within:ring-info/40">
            <Search className="h-3.5 w-3.5" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索词条或释义…"
              aria-label="搜索收藏"
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 font-mono text-xs transition-colors duration-fast",
                  filter === f.id
                    ? "border-transparent bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
          {list.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-muted-foreground">
                <Bookmark className="h-5 w-5" />
              </span>
              <div className="text-sm font-medium text-muted-foreground">
                没有匹配的收藏
              </div>
            </div>
          ) : (
            list.map((f) => (
              <div
                key={f.term}
                className="flex items-center gap-3.5 rounded-lg border border-border bg-background px-4 py-3 transition-colors duration-fast hover:border-foreground/15"
              >
                <span className="min-w-[160px] font-mono text-sm font-medium text-foreground">
                  {f.term}
                </span>
                <span className="flex-1 text-sm text-muted-foreground">
                  {f.meaning}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {f.kind === "word" ? "单词" : "短句"} · {f.src}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="V1 实装"
                    aria-label="朗读"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="V1 实装"
                    aria-label="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ViewShell>
  );
}
