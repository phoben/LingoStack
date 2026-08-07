import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "./sidebar";
import { useAppStore } from "@/stores/app-store";
import { useLayoutStore } from "@/stores/layout-store";
import { VIEW_ORDER } from "@/lib/view-meta";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/lib/sidebar-layout";

/** 导航项按钮（排除分隔条等非导航控件）。 */
function navButtons() {
  return screen
    .getByRole("navigation", { name: "主导航" })
    .querySelectorAll("button");
}

describe("Sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().setActiveView("translate");
    useLayoutStore.setState({ sidebarWidth: SIDEBAR_DEFAULT_WIDTH });
  });

  it("renders the six nav items in canonical order", () => {
    render(<Sidebar />);
    const labels = Array.from(navButtons()).map((b) => b.textContent?.trim());
    expect(labels).toEqual(["翻译", "命名", "文档", "收藏", "设置", "关于"]);
  });

  it("marks only the active view with aria-current", () => {
    render(<Sidebar />);
    const active = screen.getByRole("button", { name: "翻译" });
    expect(active).toHaveAttribute("aria-current", "page");
    const idle = screen.getByRole("button", { name: "设置" });
    expect(idle).not.toHaveAttribute("aria-current");
  });

  it("switches active view on click", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(useAppStore.getState().activeView).toBe("settings");
    expect(screen.getByRole("button", { name: "设置" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "翻译" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("exposes one nav item per entry in VIEW_ORDER", () => {
    render(<Sidebar />);
    expect(navButtons()).toHaveLength(VIEW_ORDER.length);
  });

  it("hides nav text when narrowed to icon width", () => {
    useLayoutStore.setState({ sidebarWidth: SIDEBAR_MIN_WIDTH });
    render(<Sidebar />);
    const labels = Array.from(navButtons()).map((b) => b.textContent?.trim());
    expect(labels).toEqual(["", "", "", "", "", ""]);
    // 文字隐藏后仍可按无障碍名定位（title 提供可访问名）
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });

  it("resize handle exposes the current width range", () => {
    render(<Sidebar />);
    const handle = screen.getByRole("separator", { name: "调整导航栏宽度" });
    expect(handle).toHaveAttribute(
      "aria-valuenow",
      String(SIDEBAR_DEFAULT_WIDTH),
    );
    expect(handle).toHaveAttribute("aria-valuemin", String(SIDEBAR_MIN_WIDTH));
    expect(handle).toHaveAttribute("aria-valuemax", String(SIDEBAR_MAX_WIDTH));
  });

  it("arrow keys on the handle adjust width", () => {
    render(<Sidebar />);
    const handle = screen.getByRole("separator", { name: "调整导航栏宽度" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(useLayoutStore.getState().sidebarWidth).toBeLessThan(
      SIDEBAR_DEFAULT_WIDTH,
    );
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it("Home / End jump to the width bounds", () => {
    render(<Sidebar />);
    const handle = screen.getByRole("separator", { name: "调整导航栏宽度" });
    fireEvent.keyDown(handle, { key: "Home" });
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_MIN_WIDTH);
    fireEvent.keyDown(handle, { key: "End" });
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_MAX_WIDTH);
  });

  it("double-clicking the handle toggles icon-only mode", () => {
    render(<Sidebar />);
    const handle = screen.getByRole("separator", { name: "调整导航栏宽度" });
    fireEvent.doubleClick(handle);
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_MIN_WIDTH);
    fireEvent.doubleClick(handle);
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it("dragging the handle updates width", () => {
    render(<Sidebar />);
    const handle = screen.getByRole("separator", { name: "调整导航栏宽度" });
    fireEvent.pointerDown(handle);
    // jsdom 下 getBoundingClientRect 全零，故 clientX 即为目标宽度
    fireEvent.pointerMove(window, { clientX: 240 });
    expect(useLayoutStore.getState().sidebarWidth).toBe(240);
    fireEvent.pointerUp(window);
    fireEvent.pointerMove(window, { clientX: 100 });
    expect(useLayoutStore.getState().sidebarWidth).toBe(240);
  });
});
