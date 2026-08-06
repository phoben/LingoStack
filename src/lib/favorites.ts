/**
 * 收藏的纯逻辑：类型推断、搜索过滤、导入解析。
 *
 * V1 为扁平列表（含时间与来源），分组 / 标签留 V1.5（见设计文档 §15）。
 * IndexedDB 读写见 `favorites-db.ts`；此处只放可独立单测的纯函数。
 */

export type FavKind = "word" | "phrase";

/** 收藏来源：产生该词条的功能入口。 */
export type FavSource = "翻译" | "解释" | "划词" | "命名" | "手动";

export interface Favorite {
  id: string;
  /** 原文词条。 */
  term: string;
  /** 释义 / 译文。 */
  meaning: string;
  kind: FavKind;
  source: FavSource;
  /** 创建时间戳（毫秒）。 */
  createdAt: number;
}

/** 含空白即视为短句，否则为单词。 */
export function inferKind(term: string): FavKind {
  return /\s/.test(term.trim()) ? "phrase" : "word";
}

/** 构造一条收藏（id 用 crypto.randomUUID，时间戳由调用方注入以便测试）。 */
export function newFavorite(
  term: string,
  meaning: string,
  source: FavSource,
  createdAt: number = Date.now(),
  id: string = crypto.randomUUID(),
): Favorite {
  return {
    id,
    term: term.trim(),
    meaning: meaning.trim(),
    kind: inferKind(term),
    source,
    createdAt,
  };
}

/** 按关键词与类型过滤；关键词匹配词条或释义（大小写不敏感）。 */
export function filterFavorites(
  list: Favorite[],
  query: string,
  kind: "all" | FavKind,
): Favorite[] {
  const needle = query.trim().toLowerCase();
  return list.filter((f) => {
    if (kind !== "all" && f.kind !== kind) return false;
    if (!needle) return true;
    return (
      f.term.toLowerCase().includes(needle) ||
      f.meaning.toLowerCase().includes(needle)
    );
  });
}

/** 按创建时间倒序（最新在前）。 */
export function sortByNewest(list: Favorite[]): Favorite[] {
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 解析导入的 JSON：容忍缺字段（补默认值），丢弃无 term 的条目。
 * 不信任外部输入——逐条校验类型，避免脏数据进 IndexedDB。
 */
export function parseImport(json: string): Favorite[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("不是合法的 JSON");
  }
  if (!Array.isArray(data)) {
    throw new Error("导入内容应为收藏数组");
  }
  const now = Date.now();
  return data
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => {
      const term = typeof item.term === "string" ? item.term.trim() : "";
      const meaning = typeof item.meaning === "string" ? item.meaning.trim() : "";
      const source = isFavSource(item.source) ? item.source : "手动";
      const createdAt =
        typeof item.createdAt === "number" && Number.isFinite(item.createdAt)
          ? item.createdAt
          : now;
      const id =
        typeof item.id === "string" && item.id ? item.id : crypto.randomUUID();
      return { id, term, meaning, kind: inferKind(term), source, createdAt };
    })
    .filter((f) => f.term.length > 0);
}

const SOURCES: readonly FavSource[] = [
  "翻译",
  "解释",
  "划词",
  "命名",
  "手动",
];

function isFavSource(v: unknown): v is FavSource {
  return typeof v === "string" && (SOURCES as readonly string[]).includes(v);
}

/** 导出为格式化 JSON（便于人工查看与 diff）。 */
export function toExportJson(list: Favorite[]): string {
  return JSON.stringify(sortByNewest(list), null, 2);
}
