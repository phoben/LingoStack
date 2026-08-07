import { describe, expect, it } from "vitest";
import { splitWords, toStyle } from "./case-convert";
import type { NamingStyle } from "./config-types";

describe("splitWords", () => {
  it("按空格拆分并小写化", () => {
    expect(splitWords("Get User Profile")).toEqual(["get", "user", "profile"]);
  });

  it("拆分驼峰", () => {
    expect(splitWords("getUserProfile")).toEqual(["get", "user", "profile"]);
    expect(splitWords("GetUserProfile")).toEqual(["get", "user", "profile"]);
  });

  it("拆分下划线与连字符", () => {
    expect(splitWords("get_user_profile")).toEqual(["get", "user", "profile"]);
    expect(splitWords("get-user-profile")).toEqual(["get", "user", "profile"]);
    expect(splitWords("GET_USER_PROFILE")).toEqual(["get", "user", "profile"]);
  });

  it("处理连续大写后接单词的边界", () => {
    expect(splitWords("HTTPServer")).toEqual(["http", "server"]);
    expect(splitWords("parseJSONResponse")).toEqual([
      "parse",
      "json",
      "response",
    ]);
  });

  it("保留数字并作为词的一部分", () => {
    expect(splitWords("oauth2Token")).toEqual(["oauth2", "token"]);
  });

  it("折叠多余空白与杂符号", () => {
    expect(splitWords("  get   user  ")).toEqual(["get", "user"]);
    expect(splitWords("get.user/profile")).toEqual(["get", "user", "profile"]);
  });

  it("单词输入原样小写返回", () => {
    expect(splitWords("Profile")).toEqual(["profile"]);
  });

  it("空输入与纯符号返回空数组", () => {
    expect(splitWords("")).toEqual([]);
    expect(splitWords("   ")).toEqual([]);
    expect(splitWords("---")).toEqual([]);
  });
});

describe("toStyle", () => {
  const CASES: [NamingStyle, string][] = [
    ["camel_case", "getUserProfile"],
    ["snake_case", "get_user_profile"],
    ["pascal_case", "GetUserProfile"],
    ["kebab_case", "get-user-profile"],
    ["constant_case", "GET_USER_PROFILE"],
  ];

  it.each(CASES)("把中性词组转成 %s", (style, expected) => {
    expect(toStyle("get user profile", style)).toBe(expected);
  });

  it.each(CASES)("已是驼峰的输入也能转成 %s", (style, expected) => {
    expect(toStyle("getUserProfile", style)).toBe(expected);
  });

  it("单词在各写法下的形态", () => {
    expect(toStyle("profile", "camel_case")).toBe("profile");
    expect(toStyle("profile", "pascal_case")).toBe("Profile");
    expect(toStyle("profile", "snake_case")).toBe("profile");
    expect(toStyle("profile", "kebab_case")).toBe("profile");
    expect(toStyle("profile", "constant_case")).toBe("PROFILE");
  });

  it("空输入在任一写法下都返回空串", () => {
    for (const [style] of CASES) {
      expect(toStyle("", style)).toBe("");
      expect(toStyle("  ", style)).toBe("");
    }
  });
});
