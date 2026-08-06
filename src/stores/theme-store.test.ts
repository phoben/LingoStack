import { describe, it, expect, beforeEach, vi } from "vitest";
import { useThemeStore, THEME_STORAGE_KEY } from "./theme-store";

describe("theme-store", () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ mode: "system" });
  });

  it("setMode updates state and persists to localStorage", () => {
    useThemeStore.getState().setMode("dark");
    expect(useThemeStore.getState().mode).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("cycleMode cycles light → dark → system → light", () => {
    useThemeStore.getState().setMode("light");
    useThemeStore.getState().cycleMode();
    expect(useThemeStore.getState().mode).toBe("dark");
    useThemeStore.getState().cycleMode();
    expect(useThemeStore.getState().mode).toBe("system");
    useThemeStore.getState().cycleMode();
    expect(useThemeStore.getState().mode).toBe("light");
  });

  it("cycleMode wraps system → light", () => {
    useThemeStore.getState().setMode("system");
    useThemeStore.getState().cycleMode();
    expect(useThemeStore.getState().mode).toBe("light");
  });

  it("setMode survives localStorage write failure", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    spy.mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => useThemeStore.getState().setMode("dark")).not.toThrow();
    expect(useThemeStore.getState().mode).toBe("dark");
    spy.mockRestore();
  });
});

describe("theme-store initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("reads initial mode from localStorage", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { useThemeStore } = await import("./theme-store");
    expect(useThemeStore.getState().mode).toBe("dark");
  });

  it("falls back to system when localStorage is empty", async () => {
    const { useThemeStore } = await import("./theme-store");
    expect(useThemeStore.getState().mode).toBe("system");
  });

  it("falls back to system for unknown stored value", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    const { useThemeStore } = await import("./theme-store");
    expect(useThemeStore.getState().mode).toBe("system");
  });
});
