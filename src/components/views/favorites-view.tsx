import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Plus, Search, Square, Trash2, Volume2 } from "lucide-react";
import { AddFavoritesDialog } from "@/components/add-favorites-dialog";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import {
  type FavKind,
  type Favorite,
  filterFavorites,
  parseImport,
  toExportJson,
} from "@/lib/favorites";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useTtsStore } from "@/stores/tts-store";
import { cn } from "@/lib/utils";
import { stringifyError } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

const FILTERS: ("all" | FavKind)[] = ["all", "word", "phrase"];

/** 时间戳 → 本地日期（收藏时间列）。 */
function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

interface FavoriteRowProps {
  favorite: Favorite;
  ttsStatus: string;
  speakingText: string | null;
  speakText: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
}

function FavoriteRow({
  favorite,
  ttsStatus,
  speakingText,
  speakText,
  stop,
  remove,
  retry,
}: FavoriteRowProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const termRef = useRef<HTMLSpanElement>(null);
  const meaningRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const measure = () => {
      if (expanded) return;
      setOverflows(
        [termRef.current, meaningRef.current].some(
          (element) => element !== null && element.scrollHeight > element.clientHeight + 1,
        ),
      );
    };
    measure();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measure);
    [termRef.current, meaningRef.current].forEach((element) => {
      if (element) observer?.observe(element);
    });
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [expanded, favorite.meaning, favorite.term]);

  const onRemove = async () => {
    await remove(favorite.id);
    const error = useFavoritesStore.getState().error;
    if (error) {
      toast.error(t("actionFailed", { message: error }), { duration: 4000 });
      useFavoritesStore.getState().clearError();
    } else toast.success(t("favoriteDeleted"));
  };

  const textClass = expanded
    ? "whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
    : "line-clamp-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

  return (
    <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-3 transition-colors duration-fast hover:bg-accent/40">
      <div className="min-w-0">
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
          <span ref={termRef} className={`min-w-0 font-mono text-sm font-medium text-foreground ${textClass}`}>
            {favorite.term}
          </span>
          <span ref={meaningRef} aria-live="polite" aria-busy={favorite.explanation?.status === "pending"} className={`min-w-0 text-sm text-muted-foreground ${textClass}`}>
            {favorite.meaning || (favorite.explanation?.status === "pending" ? t("explanationPending") : "")}
          </span>
        </div>
        {favorite.explanation?.status === "failed" ? <div role="alert" className="mt-1 flex items-center gap-2 text-xs text-destructive"><span>{t("explanationFailed", { message: favorite.explanation.error })}</span><button type="button" className="text-info hover:underline" onClick={() => void retry(favorite.id)}>{t("retry")}</button></div> : null}
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <span className="min-w-0 font-mono text-[10px] text-muted-foreground">
            {t(favorite.kind)} · {favorite.source} · {formatDate(favorite.createdAt)}
          </span>
          {overflows || expanded ? (
            <button
              type="button"
              className="shrink-0 text-xs text-info hover:underline focus-visible:ring-2 focus-visible:ring-info/40"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {t(expanded ? "showLess" : "showMore")}
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex items-start gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            ttsStatus === "speaking" && speakingText === favorite.term
              ? t("stopSpeaking")
              : `${t("speak")} ${favorite.term}`
          }
          onClick={() =>
            void (ttsStatus === "speaking" && speakingText === favorite.term
              ? stop()
              : speakText(favorite.term))
          }
        >
          {ttsStatus === "speaking" && speakingText === favorite.term ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button variant="ghost" size="icon" aria-label={`${t("delete")} ${favorite.term}`} onClick={() => void onRemove()}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
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
  const loaded = useFavoritesStore((s) => s.loaded);
  const error = useFavoritesStore((s) => s.error);
  const load = useFavoritesStore((s) => s.load);
  const remove = useFavoritesStore((s) => s.remove);
  const importAll = useFavoritesStore((s) => s.importAll);
  const retryExplanations = useFavoritesStore((s) => s.retryExplanations);
  const ttsStatus = useTtsStore((s) => s.status);
  const speakingText = useTtsStore((s) => s.text);
  const speakText = useTtsStore((s) => s.speakText);
  const stop = useTtsStore((s) => s.stop);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | FavKind>("all");
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const shown = useMemo(
    () => filterFavorites(list, q, filter),
    [list, q, filter],
  );

  const exportJson = () => {
    try {
      const blob = new Blob([toExportJson(list)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lingostack-favorites.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("favoritesExported"));
    } catch (error) {
      toast.error(t("actionFailed", { message: stringifyError(error) }), {
        duration: 4000,
      });
    }
  };

  const onPickFile = async (file: File) => {
    try {
      const items = parseImport(await file.text());
      await importAll(items);
      const error = useFavoritesStore.getState().error;
      if (error) {
        toast.error(t("actionFailed", { message: error }), { duration: 4000 });
        useFavoritesStore.getState().clearError();
      } else
        toast.success(t("favoritesImported", { count: String(items.length) }));
    } catch (e) {
      toast.error(t("actionFailed", { message: stringifyError(e) }), {
        duration: 4000,
      });
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
            <Button ref={addButton} size="sm" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" />{t("addFavorite")}</Button>
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
        {error ? (
          <p
            role="alert"
            className="shrink-0 border-b border-border px-4 py-2 text-xs text-accent"
          >
            {error}
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
            shown.map((favorite) => (
              <FavoriteRow
                key={favorite.id}
                favorite={favorite}
                ttsStatus={ttsStatus}
                speakingText={speakingText}
                speakText={speakText}
                stop={stop}
                remove={remove}
                retry={(id) => retryExplanations([id])}
              />
            ))
          )}
        </div>
      </div>
      {adding ? <AddFavoritesDialog onClose={() => { setAdding(false); requestAnimationFrame(() => addButton.current?.focus()); }} /> : null}
    </ViewShell>
  );
}
