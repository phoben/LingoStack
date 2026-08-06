import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Search, Trash2 } from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import {
  type FavKind,
  filterFavorites,
  parseImport,
  toExportJson,
} from "@/lib/favorites";
import { useFavoritesStore } from "@/stores/favorites-store";
import { cn } from "@/lib/utils";

const FILTERS: { id: "all" | FavKind; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "word", label: "单词" },
  { id: "phrase", label: "短句" },
];

/** 时间戳 → 本地日期（收藏时间列）。 */
function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

/**
 * 收藏视图（§3 场景 5，对齐原型收藏 panel）：
 * 搜索 + 类型过滤 + 列表 + 导入导出，数据存 IndexedDB。
 *
 * V1 为扁平列表（含时间与来源），分组 / 标签留 V1.5（§15 开放问题）。
 */
export function FavoritesView() {
  const list = useFavoritesStore((s) => s.list);
  const loading = useFavoritesStore((s) => s.loading);
  const error = useFavoritesStore((s) => s.error);
  const load = useFavoritesStore((s) => s.load);
  const remove = useFavoritesStore((s) => s.remove);
  const importAll = useFavoritesStore((s) => s.importAll);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | FavKind>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => filterFavorites(list, q, filter), [list, q, filter]);

  const exportJson = () => {
    const blob = new Blob([toExportJson(list)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lingostack-favorites.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onPickFile = async (file: File) => {
    setNotice(null);
    try {
      const items = parseImport(await file.text());
      await importAll(items);
      setNotice(`已导入 ${items.length} 条`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ViewShell
      view="favorites"
      actions={
        <>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onPickFile(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            导入 JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportJson}
            disabled={list.length === 0}
          >
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

        {notice ? (
          <p className="mb-2 shrink-0 text-xs text-info">{notice}</p>
        ) : null}
        {error ? (
          <p className="mb-2 shrink-0 text-xs text-accent">{error}</p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
          {loading ? (
            <p className="text-xs text-muted-foreground">加载中…</p>
          ) : shown.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-muted-foreground">
                <Bookmark className="h-5 w-5" />
              </span>
              <div className="text-sm font-medium text-muted-foreground">
                {list.length === 0 ? "还没有收藏" : "没有匹配的收藏"}
              </div>
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground/70">
                  在翻译结果上点收藏图标即可加入。
                </p>
              ) : null}
            </div>
          ) : (
            shown.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3.5 rounded-lg border border-border bg-background px-4 py-3 transition-colors duration-fast hover:border-foreground/15"
              >
                <span className="min-w-[160px] font-mono text-sm font-medium text-foreground">
                  {f.term}
                </span>
                <span className="flex-1 text-sm text-muted-foreground">
                  {f.meaning}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {f.kind === "word" ? "单词" : "短句"} · {f.source} ·{" "}
                  {formatDate(f.createdAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`删除 ${f.term}`}
                  onClick={() => void remove(f.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </ViewShell>
  );
}
