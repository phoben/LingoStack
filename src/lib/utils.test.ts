import { describe, it, expect } from "vitest";
import { cn, stringifyError } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("dedupes conflicting tailwind classes", () => {
    expect(cn("p-1", "p-2")).toBe("p-2");
  });

  it("filters falsy values", () => {
    expect(cn("base", false, null, undefined, "")).toBe("base");
  });
});

describe("stringifyError", () => {
  it("字符串原样返回（Tauri IPC 的 reject 形态）", () => {
    expect(stringifyError("provider 未配置")).toBe("provider 未配置");
  });

  it("Error 取 message 而非 toString", () => {
    expect(stringifyError(new Error("磁盘已满"))).toBe("磁盘已满");
  });

  it("Error 子类同样取 message", () => {
    expect(stringifyError(new TypeError("类型不符"))).toBe("类型不符");
  });

  it("其他值退化为字符串描述", () => {
    expect(stringifyError(404)).toBe("404");
    expect(stringifyError(null)).toBe("null");
    expect(stringifyError(undefined)).toBe("undefined");
  });
});
