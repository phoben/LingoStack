import { describe, expect, it } from "vitest";
import { parseCandidates } from "./naming";

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
