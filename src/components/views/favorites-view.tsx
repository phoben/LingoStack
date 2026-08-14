import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Search, Square, Trash2, Volume2 } from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import {
  type FavKind,
  filterFavorites,
  parseImport,
  toExportJson,
} from "@/lib/favorites";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useTtsStore } from "@/stores/tts-store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const FILTERS: ("all" | FavKind)[] = ["all", "word", "phrase"];

/** 时间戳 → 本地日期（收藏时间列）。 */
function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

/**
 * 收藏视图（§3 场景 5，对齐原型收藏 panel）：
 * 顶部操作行（搜索 + 类型过滤 + 导入导出）+ 列表，数据存 IndexedDB。
 * 列表为分割线行表——条目之间只隔一条浅色线，不逐条套卡片。
 *
 * V1 为扁平列表（含时间与来源），分组 / 标签留 V1.5（§15 开放问题）。
 */
export function FavoritesView() {
  const t = useT();
  const list = useFavoritesStore((s) => s.list);
  const loading = useFavoritesStore((s) => s.loading);
  const error = useFavoritesStore((s) => s.error);
  const load = useFavoritesStore((s) => s.load);
  const remove = useFavoritesStore((s) => s.remove);
  const importAll = useFavoritesStore((s) => s.importAll);
  const ttsStatus = useTtsStore((s) => s.status);
  const speakingText = useTtsStore((s) => s.text);
  const speakText = useTtsStore((s) => s.speakText);
  const stop = useTtsStore((s) => s.stop);
  const ttsError = useTtsStore((s) => s.error);
  const clearTtsError = useTtsStore((s) => s.clearError);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | FavKind>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => filterFavorites(list, q, filter),
    [list, q, filter],
  );

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
      toolbar={
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
          <label className="flex h-8 min-w-[160px] flex-1 basis-[200px] items-center gap-2 rounded-sm border border-input bg-background px-3 text-muted-foreground focus-within:border-transparent focus-within:ring-2 focus-within:ring-info/40">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchFavorites")}
              aria-label={t("searchFavorites")}
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  "rounded-full border px-3 py-1 font-mono text-[11px] transition-colors duration-fast",
                  filter === f
                    ? "border-transparent bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                )}
              >
                {t(f)}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              {t("importJson")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportJson}
              disabled={list.length === 0}
            >
              {t("exportJson")}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex h-full flex-col">
        {notice ? (
          <p
            aria-live="polite"
            className="shrink-0 border-b border-border px-4 py-2 text-xs text-info"
          >
            {notice}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="shrink-0 border-b border-border px-4 py-2 text-xs text-accent"
          >
            {error}
          </p>
        ) : null}
        {ttsError ? (
          <p
            role="alert"
            className="shrink-0 border-b border-border px-4 py-2 text-xs text-accent"
          >
            {t("speakFailed", { message: ttsError })}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 h-6"
              onClick={clearTtsError}
            >
              {t("dismiss")}
            </Button>
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col divide-y divide-border overflow-auto">
          {loading ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              {t("loading")}
            </p>
          ) : shown.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-muted-foreground">
                <Bookmark className="h-5 w-5" />
              </span>
              <div className="text-sm font-medium text-muted-foreground">
                {list.length === 0 ? t("noFavorites") : t("noMatchFavorites")}
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
                className="flex shrink-0 items-center gap-3.5 px-4 py-3 transition-colors duration-fast hover:bg-accent/40"
              >
                <span className="min-w-[160px] font-mono text-sm font-medium text-foreground">
                  {f.term}
                </span>
                <span className="flex-1 text-sm text-muted-foreground">
                  {f.meaning}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {t(f.kind)} · {f.source} · {formatDate(f.createdAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    ttsStatus === "speaking" && speakingText === f.term
                      ? t("stopSpeaking")
                      : `${t("speak")} ${f.term}`
                  }
                  onClick={() =>
                    void (ttsStatus === "speaking" && speakingText === f.term
                      ? stop()
                      : speakText(f.term))
                  }
                >
                  {ttsStatus === "speaking" && speakingText === f.term ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </Button>
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
