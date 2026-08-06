import { describe, it, expect } from "vitest";
import { cn } from "./utils";

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
