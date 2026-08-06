import { create } from "zustand";

import {
  type FavSource,
  type Favorite,
  newFavorite,
  sortByNewest,
} from "@/lib/favorites";
import {
  deleteFavorite,
  getAllFavorites,
  putFavorite,
  putFavorites,
} from "@/lib/favorites-db";

interface FavoritesState {
  list: Favorite[];
  loading: boolean;
  error: string | null;
  /** 从 IndexedDB 加载全部收藏（按时间倒序）。 */
  load: () => Promise<void>;
  /** 收藏一个词条；term 为空则忽略。 */
  add: (term: string, meaning: string, source: FavSource) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** 批量导入（已解析校验过的条目）。 */
  importAll: (items: Favorite[]) => Promise<void>;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  list: [],
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const list = await getAllFavorites();
      set({ list: sortByNewest(list), loading: false });
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
  remove: async (id) => {
    const prev = get().list;
    set({ list: prev.filter((f) => f.id !== id), error: null });
    try {
      await deleteFavorite(id);
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
}));

function stringifyError(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
}
