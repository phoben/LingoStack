/**
 * 收藏的 IndexedDB 薄封装（设计文档 §8：收藏存前端 IndexedDB，仅 UI 层消费）。
 *
 * 只做 open / getAll / put / delete / clear，业务逻辑在 `favorites.ts`。
 * 零依赖手写，避免为一个对象仓库引入 idb 之类的库。
 */

import type { Favorite } from "./favorites";

const DB_NAME = "lingostack";
const DB_VERSION = 1;
const STORE = "favorites";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
  });
}

/** 在一个事务里执行操作，并在事务完成后 resolve。 */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | null,
): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      let value: T | undefined;
      if (req) {
        req.onsuccess = () => {
          value = req.result;
        };
      }
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB 事务失败"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB 事务中断"));
    });
  } finally {
    db.close();
  }
}

/** 读取全部收藏。 */
export async function getAllFavorites(): Promise<Favorite[]> {
  const list = await withStore<Favorite[]>("readonly", (s) => s.getAll());
  return list ?? [];
}

/** 新增或覆盖一条收藏（keyPath 为 id）。 */
export async function putFavorite(fav: Favorite): Promise<void> {
  await withStore("readwrite", (s) => s.put(fav) as IDBRequest<IDBValidKey>);
}

/** 批量写入（导入用）。 */
export async function putFavorites(list: Favorite[]): Promise<void> {
  if (list.length === 0) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      try {
        list.forEach((f) => store.put(f));
      } catch (error) {
        // 某一条在排队时就因非法 key 抛错，必须主动中断，不能让已排队的
        // 前几条悄然提交，否则导入会破坏原有列表的原子性。
        tx.abort();
        reject(error);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("IndexedDB 批量写入失败"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB 事务中断"));
    });
  } finally {
    db.close();
  }
}

/** 删除一条收藏。 */
export async function deleteFavorite(id: string): Promise<void> {
  await withStore("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
}

/** Deletes all supplied ids in one transaction. Empty input must not open a transaction. */
export async function deleteFavorites(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      try {
        ids.forEach((id) => store.delete(id));
      } catch (error) {
        tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB 批量删除失败"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB 事务中断"));
    });
  } finally {
    db.close();
  }
}
