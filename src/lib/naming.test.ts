import { describe, expect, it } from "vitest";
import {
  GRID_ROWS,
  GRID_STYLES,
  buildNamingGrid,
  parseCandidates,
} from "./naming";

describe("parseCandidates", () => {
  it("按行拆分并去除空行", () => {
    expect(parseCandidates("getUserProfile\nfetchUserProfile\n\n")).toEqual([
      "getUserProfile",
      "fetchUserProfile",
    ]);
  });

  it("清洗编号前缀", () => {
    expect(parseCandidates("1. getUser\n2) fetchUser")).toEqual([
      "getUser",
      "fetchUser",
    ]);
  });

  it("清洗项目符号", () => {
    expect(parseCandidates("- getUser\n* fetchUser\n• loadUser")).toEqual([
      "getUser",
      "fetchUser",
      "loadUser",
    ]);
  });

  it("清洗反引号", () => {
    expect(parseCandidates("`getUser`\n``fetchUser``")).toEqual([
      "getUser",
      "fetchUser",
    ]);
  });

  it("空输入返回空数组", () => {
    expect(parseCandidates("")).toEqual([]);
    expect(parseCandidates("   \n  \n")).toEqual([]);
  });

  it("保留标识符内部的下划线与连字符", () => {
    expect(parseCandidates("get_user_profile\nget-user-profile")).toEqual([
      "get_user_profile",
      "get-user-profile",
    ]);
  });

  it("保持候选顺序", () => {
    expect(parseCandidates("a\nb\nc")).toEqual(["a", "b", "c"]);
  });
});

describe("buildNamingGrid", () => {
  it("每行含五种写法且逐行对齐同一个词", () => {
    const grid = buildNamingGrid("get user profile\nfetch account data");
    expect(grid).toHaveLength(2);
    expect(grid[0]).toEqual({
      camel_case: "getUserProfile",
      snake_case: "get_user_profile",
      pascal_case: "GetUserProfile",
      kebab_case: "get-user-profile",
      constant_case: "GET_USER_PROFILE",
    });
    expect(grid[1].camel_case).toBe("fetchAccountData");
  });

  it("每行五列齐全，无空缺", () => {
    const grid = buildNamingGrid("get user\nsave user\ndrop user");
    for (const row of grid) {
      for (const style of GRID_STYLES) {
        expect(row[style]).toBeTruthy();
      }
    }
  });

  it("超出五行时截断到上限", () => {
    const raw = ["one", "two", "three", "four", "five", "six", "seven"].join(
      "\n",
    );
    expect(buildNamingGrid(raw)).toHaveLength(GRID_ROWS);
  });

  it("模型少给行时只渲染实际行数，不填占位", () => {
    expect(buildNamingGrid("get user\nsave user")).toHaveLength(2);
  });

  it("兼容模型输出带写法修饰或编号的情况", () => {
    const grid = buildNamingGrid("1. getUserProfile\n- fetch_user_data");
    expect(grid[0].snake_case).toBe("get_user_profile");
    expect(grid[1].camel_case).toBe("fetchUserData");
  });

  it("丢弃转换后为空的行", () => {
    expect(buildNamingGrid("get user\n---\n***")).toHaveLength(1);
  });

  it("空输入返回空网格", () => {
    expect(buildNamingGrid("")).toEqual([]);
    expect(buildNamingGrid("  \n \n")).toEqual([]);
  });

  it("五列顺序固定", () => {
    expect(GRID_STYLES).toEqual([
      "camel_case",
      "snake_case",
      "pascal_case",
      "kebab_case",
      "constant_case",
    ]);
  });
});
