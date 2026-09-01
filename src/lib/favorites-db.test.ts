import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";

import type { Favorite } from "./favorites";
import {
  deleteFavorite,
  deleteFavorites,
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

  it("deletes multiple matching favorites atomically", async () => {
    await putFavorites([sample("one"), sample("two"), sample("keep")]);
    await deleteFavorites(["one", "two"]);
    expect((await getAllFavorites()).map((item) => item.id)).toEqual(["keep"]);
  });

  it("rolls back every queued deletion when the IndexedDB transaction aborts", async () => {
    await putFavorites([sample("one"), sample("two"), sample("keep")]);
    const originalDelete = IDBObjectStore.prototype.delete;
    let calls = 0;
    IDBObjectStore.prototype.delete = function (key: IDBValidKey | IDBKeyRange) {
      const request = originalDelete.call(this, key);
      calls += 1;
      if (calls === 2) this.transaction.abort();
      return request;
    };

    try {
      await expect(deleteFavorites(["one", "two"])).rejects.toBeTruthy();
    } finally {
      IDBObjectStore.prototype.delete = originalDelete;
    }

    expect((await getAllFavorites()).map((item) => item.id).sort()).toEqual([
      "keep",
      "one",
      "two",
    ]);
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
