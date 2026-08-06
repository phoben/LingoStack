import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { resolveTheme, useApplyTheme } from "./use-theme";
import { useThemeStore } from "@/stores/theme-store";

describe("resolveTheme", () => {
  it("returns explicit modes directly", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  // matchMedia 桩（test-setup.ts）默认 matches:false → system 解析为 light
  it("resolves system via matchMedia", () => {
    expect(resolveTheme("system")).toBe("light");
  });
});

describe("useApplyTheme", () => {
  it("adds .dark class when mode is dark", () => {
    useThemeStore.setState({ mode: "dark" });
    renderHook(() => useApplyTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes .dark class when mode is light", () => {
    document.documentElement.classList.add("dark");
    useThemeStore.setState({ mode: "light" });
    renderHook(() => useApplyTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
