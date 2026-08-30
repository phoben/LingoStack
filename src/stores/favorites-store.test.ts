import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/favorites-db", () => ({
  deleteFavorite: vi.fn(),
  getAllFavorites: vi.fn(),
  putFavorite: vi.fn(),
  putFavorites: vi.fn(),
}));

import {
  deleteFavorite,
  getAllFavorites,
  putFavorite,
  putFavorites,
} from "@/lib/favorites-db";
import type { Favorite } from "@/lib/favorites";
import { useFavoritesStore } from "./favorites-store";

const favorite = (id: string, createdAt = 1): Favorite => ({
  id,
  term: id,
  meaning: "释义",
  kind: "word",
  source: "翻译",
  createdAt,
});

describe("favorites-store", () => {
  beforeEach(() => {
    vi.mocked(deleteFavorite).mockReset();
    vi.mocked(getAllFavorites).mockReset();
    vi.mocked(putFavorite).mockReset();
    vi.mocked(putFavorites).mockReset();
    useFavoritesStore.setState({
      list: [favorite("existing")],
      loading: false,
      error: null,
    });
  });

  it("rolls back an optimistic add when IndexedDB rejects", async () => {
    vi.mocked(putFavorite).mockRejectedValue("quota exceeded");
    await useFavoritesStore.getState().add("new", "新释义", "翻译");
    expect(useFavoritesStore.getState().list).toEqual([favorite("existing")]);
    expect(useFavoritesStore.getState().error).toBe("quota exceeded");
  });

  it("rolls back an optimistic delete when IndexedDB rejects", async () => {
    vi.mocked(deleteFavorite).mockRejectedValue(new Error("blocked"));
    await useFavoritesStore.getState().remove("existing");
    expect(useFavoritesStore.getState().list).toEqual([favorite("existing")]);
    expect(useFavoritesStore.getState().error).toBe("blocked");
  });

  it("keeps the current list when atomic import rejects", async () => {
    vi.mocked(putFavorites).mockRejectedValue("invalid import");
    await useFavoritesStore.getState().importAll([favorite("new")]);
    expect(useFavoritesStore.getState().list).toEqual([favorite("existing")]);
    expect(useFavoritesStore.getState().error).toBe("invalid import");
    expect(getAllFavorites).not.toHaveBeenCalled();
  });

  it("refreshes the sorted list after a successful import", async () => {
    vi.mocked(getAllFavorites).mockResolvedValue([
      favorite("old", 1),
      favorite("new", 2),
    ]);
    await useFavoritesStore.getState().importAll([favorite("new", 2)]);
    expect(useFavoritesStore.getState().list.map((item) => item.id)).toEqual([
      "new",
      "old",
    ]);
  });

  it("can clear an error after a transient action has reported it", () => {
    useFavoritesStore.setState({ error: "quota exceeded" });
    useFavoritesStore.getState().clearError();
    expect(useFavoritesStore.getState().error).toBeNull();
  });
});
