import { describe, expect, it } from "vitest";
import {
  type Favorite,
  filterFavorites,
  inferKind,
  matchesFavoriteTerm,
  normalizeFavoriteContent,
  newFavorite,
  parseImport,
  sortByNewest,
  toExportJson,
  validateManualFavorites,
} from "./favorites";

function fav(over: Partial<Favorite> = {}): Favorite {
  return {
    id: "1",
    term: "idempotent",
    meaning: "幂等",
    kind: "word",
    source: "翻译",
    createdAt: 1000,
    ...over,
  };
}

describe("inferKind", () => {
  it("无空白为单词", () => {
    expect(inferKind("idempotent")).toBe("word");
  });

  it("含空白为短句", () => {
    expect(inferKind("graceful shutdown")).toBe("phrase");
  });

  it("忽略首尾空白", () => {
    expect(inferKind("  idempotent  ")).toBe("word");
  });
});

describe("favorite content identity", () => {
  it("normalizes whitespace and case without changing CJK text", () => {
    expect(normalizeFavoriteContent("  GitHub\n Copilot ")).toBe("github copilot");
    expect(normalizeFavoriteContent("术语 解释")).toBe("术语 解释");
  });

  it("matches a term regardless of its explanation", () => {
    const saved = fav({ term: " GitHub Copilot ", meaning: " AI  编程助手 " });
    expect(matchesFavoriteTerm(saved, "github copilot")).toBe(true);
    expect(matchesFavoriteTerm(saved, "other term")).toBe(false);
  });
});

describe("newFavorite", () => {
  it("裁剪空白并推断类型", () => {
    const f = newFavorite("  race condition  ", "  竞态  ", "划词", 500, "x");
    expect(f).toEqual({
      id: "x",
      term: "race condition",
      meaning: "竞态",
      kind: "phrase",
      source: "划词",
      createdAt: 500,
    });
  });
});

describe("filterFavorites", () => {
  const list = [
    fav({ id: "a", term: "idempotent", meaning: "幂等", kind: "word" }),
    fav({
      id: "b",
      term: "graceful shutdown",
      meaning: "优雅停机",
      kind: "phrase",
    }),
  ];

  it("空查询返回全部", () => {
    expect(filterFavorites(list, "", "all")).toHaveLength(2);
  });

  it("按类型过滤", () => {
    expect(filterFavorites(list, "", "phrase").map((f) => f.id)).toEqual(["b"]);
  });

  it("匹配词条（大小写不敏感）", () => {
    expect(filterFavorites(list, "IDEM", "all").map((f) => f.id)).toEqual(["a"]);
  });

  it("匹配释义", () => {
    expect(filterFavorites(list, "优雅", "all").map((f) => f.id)).toEqual(["b"]);
  });

  it("类型与关键词同时生效", () => {
    expect(filterFavorites(list, "幂等", "phrase")).toHaveLength(0);
  });
});

describe("sortByNewest", () => {
  it("按创建时间倒序且不改原数组", () => {
    const list = [fav({ id: "old", createdAt: 1 }), fav({ id: "new", createdAt: 9 })];
    expect(sortByNewest(list).map((f) => f.id)).toEqual(["new", "old"]);
    expect(list[0].id).toBe("old");
  });
});

describe("parseImport", () => {
  it("解析合法数组", () => {
    const json = JSON.stringify([
      { id: "a", term: "idempotent", meaning: "幂等", source: "翻译", createdAt: 5 },
    ]);
    const out = parseImport(json);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "a",
      term: "idempotent",
      kind: "word",
      source: "翻译",
      createdAt: 5,
    });
  });

  it("补齐缺失字段", () => {
    const out = parseImport(JSON.stringify([{ term: "backpressure" }]));
    expect(out[0].meaning).toBe("");
    expect(out[0].source).toBe("手动");
    expect(out[0].id).toBeTruthy();
    expect(Number.isFinite(out[0].createdAt)).toBe(true);
  });

  it("丢弃无 term 的条目", () => {
    const out = parseImport(
      JSON.stringify([{ meaning: "无词条" }, { term: "ok" }, {}, null]),
    );
    expect(out.map((f) => f.term)).toEqual(["ok"]);
  });

  it("非法 source 回退为手动", () => {
    const out = parseImport(
      JSON.stringify([{ term: "x", source: "<script>" }]),
    );
    expect(out[0].source).toBe("手动");
  });

  it("非 JSON 抛错", () => {
    expect(() => parseImport("{ not json")).toThrow("不是合法的 JSON");
  });

  it("非数组抛错", () => {
    expect(() => parseImport('{"term":"x"}')).toThrow("应为收藏数组");
  });
});

describe("toExportJson", () => {
  it("导出为倒序的格式化 JSON", () => {
    const json = toExportJson([
      fav({ id: "old", createdAt: 1 }),
      fav({ id: "new", createdAt: 9 }),
    ]);
    expect(json).toContain("\n");
    expect(JSON.parse(json).map((f: Favorite) => f.id)).toEqual(["new", "old"]);
  });

  it("does not expose internal explanation lifecycle metadata", () => {
    const json = toExportJson([fav({ explanation: { status: "failed", language: "zh", error: "secret" } })]);
    expect(json).not.toContain("explanation");
    expect(json).not.toContain("secret");
  });
});

describe("manual favorite validation", () => {
  it("rejects empty, batch duplicate, and saved duplicate while retaining valid rows", () => {
    const result = validateManualFavorites(["  ", "Redis", " redis ", "Kafka"], [fav({ term: "Kafka" })]);
    expect(result.valid).toEqual(["Redis"]);
    expect(result.errors.get(0)).toBe("empty");
    expect(result.errors.get(2)).toBe("duplicate");
    expect(result.errors.get(3)).toBe("alreadySaved");
  });
});
