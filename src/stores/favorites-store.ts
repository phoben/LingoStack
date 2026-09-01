import { create } from "zustand";

import {
  type FavSource,
  type ExplanationLanguage,
  type Favorite,
  newManualFavorites,
  validateManualFavorites,
  matchesFavoriteTerm,
  newFavorite,
  sortByNewest,
} from "@/lib/favorites";
import {
  deleteFavorite,
  deleteFavorites,
  getAllFavorites,
  putFavorite,
  putFavorites,
  updateFavoriteIfExists,
} from "@/lib/favorites-db";
import { explainTerms } from "@/lib/ipc";
import { stringifyError } from "@/lib/utils";

interface FavoritesState {
  list: Favorite[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** 从 IndexedDB 加载全部收藏（按时间倒序）。 */
  load: () => Promise<void>;
  /** 收藏一个词条；term 为空则忽略。 */
  add: (term: string, meaning: string, source: FavSource) => Promise<void>;
  /** Atomically persist manual rows, then start their explanation in the background. */
  addManualBatch: (
    contents: string[],
    language: ExplanationLanguage,
  ) => Promise<{ count: number; errors: Map<number, string> }>;
  retryExplanations: (ids: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Adds a term, or removes every historical record with the same normalized term. */
  toggle: (term: string, meaning: string, source: FavSource) => Promise<void>;
  /** 批量导入（已解析校验过的条目）。 */
  importAll: (items: Favorite[]) => Promise<void>;
  /** Clears an error that has already been presented by a transient UI action. */
  clearError: () => void;
}

type ExplanationJob = { ids: string[]; language: ExplanationLanguage };
const explanationQueue: ExplanationJob[] = [];
const retryTransitioningIds = new Set<string>();
let queueRunning = false;

function explanationFailureMessage(
  language: ExplanationLanguage,
  reason: "missing" | "request" | "interrupted",
): string {
  const messages =
    language === "en"
      ? {
          missing: "No valid explanation was returned.",
          request: "Could not generate the explanation. Please retry.",
          interrupted: "Previous generation did not finish. Retry it.",
        }
      : {
          missing: "未收到有效解释",
          request: "无法生成解释，请重试",
          interrupted: "上次生成未完成，请重试",
        };
  return messages[reason];
}

function enqueue(job: ExplanationJob) {
  explanationQueue.push(job);
  void drainQueue();
}

async function persistAndSet(
  id: string,
  transform: (favorite: Favorite) => Favorite,
) {
  try {
    const saved = await updateFavoriteIfExists(id, transform);
    if (!saved) return false;
    useFavoritesStore.setState((state) => ({
      list: state.list.map((item) => (item.id === id ? transform(item) : item)),
    }));
    return true;
  } catch (error) {
    useFavoritesStore.setState({ error: stringifyError(error) });
    return false;
  }
}

async function drainQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (explanationQueue.length) {
      const job = explanationQueue.shift();
      if (!job) continue;
      const current = useFavoritesStore
        .getState()
        .list.filter(
          (item) =>
            job.ids.includes(item.id) &&
            (item.explanation?.status === "pending" ||
              item.explanation?.status === "failed"),
        );
      if (!current.length) continue;
      try {
        const response = await explainTerms(
          current.map((item) => ({ id: item.id, content: item.term })),
          job.language,
        );
        const expected = new Set(current.map((item) => item.id));
        const results = new Map<string, string>();
        for (const result of response.items) {
          if (
            expected.has(result.id) &&
            result.explanation.trim() &&
            !results.has(result.id)
          )
            results.set(result.id, result.explanation.trim());
        }
        await Promise.all(
          current.map((item) => {
            const meaning = results.get(item.id);
            return persistAndSet(item.id, (existing) => ({
              ...existing,
              meaning: meaning ?? existing.meaning,
              explanation: meaning
                ? { status: "ready", language: job.language }
                : {
                    status: "failed",
                    language: job.language,
                    error: explanationFailureMessage(job.language, "missing"),
                  },
            }));
          }),
        );
      } catch {
        await Promise.all(
          current.map((item) => {
            const live = useFavoritesStore
              .getState()
              .list.find((candidate) => candidate.id === item.id);
            if (!live || live.explanation?.status === "ready")
              return Promise.resolve(false);
            return persistAndSet(item.id, (existing) => ({
              ...existing,
              explanation: {
                status: "failed",
                language: job.language,
                // Backend/provider errors can have a different locale or include
                // implementation details. Keep the durable UI state in the
                // interface language instead of persisting provider details.
                error: explanationFailureMessage(job.language, "request"),
              },
            }));
          }),
        );
      }
    }
  } finally {
    queueRunning = false;
  }
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  list: [],
  loading: false,
  loaded: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const list = await getAllFavorites();
      const interrupted = list.map((item) =>
        item.explanation?.status === "pending"
          ? {
              ...item,
              explanation: {
                status: "failed" as const,
                language: item.explanation.language,
                error: explanationFailureMessage(
                  item.explanation.language,
                  "interrupted",
                ),
              },
            }
          : item,
      );
      const changed = interrupted.filter((item, index) => item !== list[index]);
      if (changed.length) await putFavorites(changed);
      set({ list: sortByNewest(interrupted), loading: false, loaded: true });
    } catch (e) {
      set({ loading: false, error: stringifyError(e) });
    }
  },
  add: async (term, meaning, source) => {
    if (!term.trim()) return;
    const fav = newFavorite(term, meaning, source);
    // 乐观插入到列表头（最新在前），失败则回滚。
    const prev = get().list;
    set({ list: [fav, ...prev], error: null });
    try {
      await putFavorite(fav);
    } catch (e) {
      set({ list: prev, error: stringifyError(e) });
    }
  },
  addManualBatch: async (contents, language) => {
    if (contents.length > 10) {
      const error = "一次最多新增 10 项收藏";
      set({ error });
      return { count: 0, errors: new Map<number, string>() };
    }
    const validation = validateManualFavorites(contents, get().list);
    const errors = new Map(
      [...validation.errors].map(([index, reason]) => [index, reason]),
    );
    if (!validation.valid.length) return { count: 0, errors };
    const favorites = newManualFavorites(validation.valid, language);
    const prev = get().list;
    set({ list: sortByNewest([...favorites, ...prev]), error: null });
    try {
      await putFavorites(favorites);
      enqueue({ ids: favorites.map((item) => item.id), language });
      return { count: favorites.length, errors };
    } catch (e) {
      set({ list: prev, error: stringifyError(e) });
      return { count: 0, errors };
    }
  },
  retryExplanations: async (ids) => {
    const selected = get().list.filter(
      (item) =>
        ids.includes(item.id) &&
        item.explanation?.status === "failed" &&
        !retryTransitioningIds.has(item.id),
    );
    if (!selected.length) return;
    selected.forEach((item) => retryTransitioningIds.add(item.id));
    try {
      const persisted = await Promise.all(
        selected.map((item) =>
          persistAndSet(item.id, (existing) => ({
            ...existing,
            explanation: {
              status: "pending",
              language: item.explanation!.language,
            },
          })),
        ),
      );
      const byLanguage = new Map<ExplanationLanguage, string[]>();
      selected.forEach((item, index) => {
        if (!persisted[index]) return;
        const idsForLanguage = byLanguage.get(item.explanation!.language) ?? [];
        idsForLanguage.push(item.id);
        byLanguage.set(item.explanation!.language, idsForLanguage);
      });
      byLanguage.forEach((retryIds, language) =>
        enqueue({ ids: retryIds, language }),
      );
    } finally {
      selected.forEach((item) => retryTransitioningIds.delete(item.id));
    }
  },
  remove: async (id) => {
    const prev = get().list;
    set({ list: prev.filter((f) => f.id !== id), error: null });
    try {
      await deleteFavorite(id);
    } catch (e) {
      set({ list: prev, error: stringifyError(e) });
    }
  },
  toggle: async (term, meaning, source) => {
    if (!term.trim()) return;
    const prev = get().list;
    const matches = prev.filter((favorite) =>
      matchesFavoriteTerm(favorite, term),
    );
    if (matches.length === 0) {
      const favorite = newFavorite(term, meaning, source);
      set({ list: sortByNewest([favorite, ...prev]), error: null });
      try {
        await putFavorite(favorite);
      } catch (e) {
        set({ list: prev, error: stringifyError(e) });
      }
      return;
    }
    const ids = matches.map((favorite) => favorite.id);
    set({
      list: prev.filter((favorite) => !ids.includes(favorite.id)),
      error: null,
    });
    try {
      await deleteFavorites(ids);
    } catch (e) {
      set({ list: prev, error: stringifyError(e) });
    }
  },
  importAll: async (items) => {
    if (items.length === 0) return;
    try {
      await putFavorites(items);
      const list = await getAllFavorites();
      set({ list: sortByNewest(list), error: null });
    } catch (e) {
      set({ error: stringifyError(e) });
    }
  },
  clearError: () => set({ error: null }),
}));

/** Test-only queue reset; production calls never need to clear in-memory work. */
export function resetFavoritesExplanationQueueForTest(): void {
  explanationQueue.length = 0;
  retryTransitioningIds.clear();
  queueRunning = false;
}
