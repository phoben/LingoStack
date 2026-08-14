import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";

import type { Favorite } from "./favorites";
import {
  deleteFavorite,
  getAllFavorites,
  putFavorite,
  putFavorites,
} from "./favorites-db";

const sample = (id: string, createdAt = 1): Favorite => ({
  id,
  term: id,
  meaning: "释义",
  kind: "word",
  source: "翻译",
  createdAt,
});

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("lingostack");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

afterEach(async () => {
  await resetDb();
});

describe("favorites-db", () => {
  it("stores, reads, and deletes a favorite", async () => {
    await putFavorite(sample("one"));
    expect(await getAllFavorites()).toEqual([sample("one")]);
    await deleteFavorite("one");
    expect(await getAllFavorites()).toEqual([]);
  });

  it("rolls back the entire import transaction when one record is invalid", async () => {
    await putFavorite(sample("existing"));
    const invalid = { ...sample("invalid"), id: null } as unknown as Favorite;

    await expect(putFavorites([sample("new"), invalid])).rejects.toBeTruthy();
    expect((await getAllFavorites()).map((item) => item.id)).toEqual([
      "existing",
    ]);
  });
});
