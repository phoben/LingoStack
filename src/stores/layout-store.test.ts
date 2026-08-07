import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/lib/sidebar-layout";
import { SIDEBAR_WIDTH_STORAGE_KEY, useLayoutStore } from "./layout-store";

describe("layout-store", () => {
  beforeEach(() => {
    localStorage.clear();
    useLayoutStore.setState({ sidebarWidth: SIDEBAR_DEFAULT_WIDTH });
  });

  it("默认宽度为 188", () => {
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it("setSidebarWidth 收敛越界值并写入 localStorage", () => {
    useLayoutStore.getState().setSidebarWidth(9999);
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_MAX_WIDTH);
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe(
      String(SIDEBAR_MAX_WIDTH),
    );
  });

  it("sidebarLabelsVisible 随宽度变化", () => {
    expect(useLayoutStore.getState().sidebarLabelsVisible()).toBe(true);
    useLayoutStore.getState().setSidebarWidth(SIDEBAR_MIN_WIDTH);
    expect(useLayoutStore.getState().sidebarLabelsVisible()).toBe(false);
  });

  it("toggleSidebarWidth 在最窄与默认之间往返", () => {
    useLayoutStore.getState().toggleSidebarWidth();
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_MIN_WIDTH);
    useLayoutStore.getState().toggleSidebarWidth();
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it("setSidebarWidth 在 localStorage 写入失败时仍生效", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    spy.mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => useLayoutStore.getState().setSidebarWidth(200)).not.toThrow();
    expect(useLayoutStore.getState().sidebarWidth).toBe(200);
    spy.mockRestore();
  });
});

describe("layout-store initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("模块加载时读取已存宽度", async () => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "210");
    const { useLayoutStore } = await import("./layout-store");
    expect(useLayoutStore.getState().sidebarWidth).toBe(210);
  });

  it("已存宽度非法时回退到默认", async () => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "not-a-number");
    const { useLayoutStore } = await import("./layout-store");
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it("已存宽度越界时收敛", async () => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "9999");
    const { useLayoutStore } = await import("./layout-store");
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_MAX_WIDTH);
  });
});
