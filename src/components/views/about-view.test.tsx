import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AboutView } from "./about-view";
import { defaultConfig } from "@/lib/config-types";
import { useConfigStore } from "@/stores/config-store";
import { useUpdateStore } from "@/stores/update-store";

describe("AboutView updates", () => {
  beforeEach(() => {
    useConfigStore.setState({ config: { ...defaultConfig(), ui_language: "en" } });
    useUpdateStore.getState().resetForTest();
  });

  it("offers a keyboard-accessible manual check", () => {
    const check = vi.fn();
    useUpdateStore.setState({ check });
    render(<AboutView />);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(check).toHaveBeenCalledWith("manual");
  });

  it("renders release notes as text and uses the trusted GitHub release URL", () => {
    useUpdateStore.setState({
      status: "available",
      available: { version: "0.0.3", date: "2026-08-31", notes: "Fix <script>alert(1)</script>" },
    });
    render(<AboutView />);
    expect(screen.getByText("Fix <script>alert(1)</script>")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View full release notes" })).toHaveAttribute(
      "href",
      "https://github.com/phoben/LingoStack/releases/tag/v0.0.3",
    );
    expect(screen.getByRole("button", { name: "Update now" })).toBeInTheDocument();
  });

  it("exposes download progress without blocking the rest of the view", () => {
    useUpdateStore.setState({ status: "downloading", downloadedBytes: 50, contentLength: 100 });
    render(<AboutView />);
    expect(screen.getByText("Downloaded 50%")).toBeInTheDocument();
    expect(screen.getByText("Downloaded 50%").parentElement).toHaveAttribute("aria-busy", "true");
  });
});
