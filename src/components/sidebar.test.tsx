import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "./sidebar";
import { useAppStore } from "@/stores/app-store";
import { VIEW_ORDER } from "@/lib/view-meta";

describe("Sidebar", () => {
  beforeEach(() => {
    useAppStore.getState().setActiveView("translate");
  });

  it("renders the six nav items in canonical order", () => {
    render(<Sidebar />);
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
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
    expect(screen.getAllByRole("button")).toHaveLength(VIEW_ORDER.length);
  });
});
