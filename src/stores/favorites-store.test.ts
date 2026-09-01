import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/favorites-db", () => ({
  deleteFavorite: vi.fn(),
  deleteFavorites: vi.fn(),
  getAllFavorites: vi.fn(),
  putFavorite: vi.fn(),
  putFavorites: vi.fn(),
  updateFavoriteIfExists: vi.fn(),
}));
vi.mock("@/lib/ipc", () => ({ explainTerms: vi.fn() }));

import {
  deleteFavorite,
  deleteFavorites,
  getAllFavorites,
  putFavorite,
  putFavorites,
  updateFavoriteIfExists,
} from "@/lib/favorites-db";
import { explainTerms } from "@/lib/ipc";
import type { Favorite } from "@/lib/favorites";
import {
  resetFavoritesExplanationQueueForTest,
  useFavoritesStore,
} from "./favorites-store";

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
    resetFavoritesExplanationQueueForTest();
    vi.mocked(deleteFavorite).mockReset();
    vi.mocked(deleteFavorites).mockReset();
    vi.mocked(getAllFavorites).mockReset();
    vi.mocked(putFavorite).mockReset();
    vi.mocked(putFavorites).mockReset();
    vi.mocked(updateFavoriteIfExists).mockReset();
    vi.mocked(updateFavoriteIfExists).mockResolvedValue(true);
    vi.mocked(explainTerms).mockReset();
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

  it("removes every historical duplicate even when its explanation differs", async () => {
    const duplicate = {
      ...favorite("duplicate"),
      term: "EXISTING",
      meaning: "释义",
    };
    const different = {
      ...favorite("different"),
      term: "existing",
      meaning: "另一释义",
    };
    useFavoritesStore.setState({
      list: [favorite("existing"), duplicate, different],
    });
    await useFavoritesStore.getState().toggle(" existing ", "释义", "翻译");
    expect(useFavoritesStore.getState().list).toEqual([]);
    expect(deleteFavorites).toHaveBeenCalledWith([
      "existing",
      "duplicate",
      "different",
    ]);
    expect(putFavorite).not.toHaveBeenCalled();
  });

  it("restores every duplicate when atomic removal fails", async () => {
    vi.mocked(deleteFavorites).mockRejectedValue("blocked");
    const duplicate = { ...favorite("duplicate"), term: "existing" };
    useFavoritesStore.setState({ list: [favorite("existing"), duplicate] });
    await useFavoritesStore.getState().toggle("existing", "释义", "翻译");
    expect(useFavoritesStore.getState().list.map((item) => item.id)).toEqual([
      "existing",
      "duplicate",
    ]);
    expect(useFavoritesStore.getState().error).toBe("blocked");
  });

  it("persists manual rows before starting explanation and freezes request language", async () => {
    let resolveRequest!: (value: {
      items: { id: string; explanation: string }[];
    }) => void;
    vi.mocked(explainTerms).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const result = await useFavoritesStore
      .getState()
      .addManualBatch(["Redis"], "en");
    expect(result.count).toBe(1);
    expect(putFavorites).toHaveBeenCalledOnce();
    const pending = useFavoritesStore
      .getState()
      .list.find((item) => item.term === "Redis")!;
    expect(pending.explanation).toEqual({ status: "pending", language: "en" });
    await vi.waitFor(() =>
      expect(explainTerms).toHaveBeenCalledWith(
        [{ id: pending.id, content: "Redis" }],
        "en",
      ),
    );
    resolveRequest({
      items: [{ id: pending.id, explanation: "An in-memory store." }],
    });
    await vi.waitFor(() =>
      expect(
        useFavoritesStore.getState().list.find((item) => item.id === pending.id)
          ?.explanation?.status,
      ).toBe("ready"),
    );
  });

  it("rejects more than ten manual rows without persisting or invoking AI", async () => {
    const result = await useFavoritesStore.getState().addManualBatch(
      Array.from({ length: 11 }, (_, index) => `term-${index}`),
      "zh",
    );
    expect(result.count).toBe(0);
    expect(putFavorites).not.toHaveBeenCalled();
    expect(explainTerms).not.toHaveBeenCalled();
    expect(useFavoritesStore.getState().error).toContain("10");
  });

  it("does not enqueue a retry when restoring its pending state did not persist", async () => {
    const failed: Favorite = {
      ...favorite("failed"),
      explanation: {
        status: "failed",
        language: "en",
        error: "Could not generate the explanation. Please retry.",
      },
    };
    useFavoritesStore.setState({ list: [failed] });
    vi.mocked(updateFavoriteIfExists).mockResolvedValue(false);

    await useFavoritesStore.getState().retryExplanations([failed.id]);

    expect(explainTerms).not.toHaveBeenCalled();
  });

  it("deduplicates repeated retry clicks while the pending state is being persisted", async () => {
    const failed: Favorite = {
      ...favorite("failed"),
      explanation: {
        status: "failed",
        language: "zh",
        error: "无法生成解释，请重试",
      },
    };
    useFavoritesStore.setState({ list: [failed] });
    let resolvePersist!: (saved: boolean) => void;
    vi.mocked(updateFavoriteIfExists).mockReturnValue(
      new Promise((resolve) => {
        resolvePersist = resolve;
      }),
    );

    const first = useFavoritesStore.getState().retryExplanations([failed.id]);
    const second = useFavoritesStore.getState().retryExplanations([failed.id]);
    expect(updateFavoriteIfExists).toHaveBeenCalledOnce();

    resolvePersist(false);
    await Promise.all([first, second]);
    expect(explainTerms).not.toHaveBeenCalled();
  });

  it("restores interrupted work in the language frozen for that batch without calling AI", async () => {
    const interrupted: Favorite = {
      ...favorite("interrupted"),
      explanation: { status: "pending", language: "en" },
    };
    vi.mocked(getAllFavorites).mockResolvedValue([interrupted]);

    await useFavoritesStore.getState().load();

    expect(useFavoritesStore.getState().list[0]?.explanation).toEqual({
      status: "failed",
      language: "en",
      error: "Previous generation did not finish. Retry it.",
    });
    expect(explainTerms).not.toHaveBeenCalled();
  });
});
