import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TitleBar } from "./title-bar";
import { useThemeStore } from "@/stores/theme-store";
import { defaultConfig } from "@/lib/config-types";
import { useConfigStore } from "@/stores/config-store";
import { useUpdateStore } from "@/stores/update-store";

const mockWindow = {
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  hide: vi.fn(),
  isMaximized: vi.fn().mockResolvedValue(false),
  onResized: vi.fn().mockResolvedValue(vi.fn()),
};

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mockWindow,
}));

describe("TitleBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useThemeStore.setState({ mode: "system" });
    useUpdateStore.getState().resetForTest();
    useConfigStore.setState({ config: { ...defaultConfig(), ui_language: "zh" } });
  });

  // findByRole 会 flush 微任务，顺带消化 effect 中 isMaximized() 的异步 resolve，
  // 避免 "not wrapped in act(...)" 警告。

  it("renders the app title", async () => {
    render(<TitleBar />);
    expect(await screen.findByText(/译栈/)).toBeInTheDocument();
  });

  it("minimize button calls window.minimize", async () => {
    render(<TitleBar />);
    const btn = await screen.findByRole("button", { name: "最小化" });
    fireEvent.click(btn);
    expect(mockWindow.minimize).toHaveBeenCalledOnce();
  });

  it("maximize button calls toggleMaximize", async () => {
    render(<TitleBar />);
    const btn = await screen.findByRole("button", { name: "最大化" });
    fireEvent.click(btn);
    expect(mockWindow.toggleMaximize).toHaveBeenCalledOnce();
  });

  it("close button hides the main window so the tray can reopen it", async () => {
    render(<TitleBar />);
    const btn = await screen.findByRole("button", { name: "关闭" });
    fireEvent.click(btn);
    expect(mockWindow.hide).toHaveBeenCalledOnce();
  });

  it("theme toggle cycles mode system → light", async () => {
    render(<TitleBar />);
    const btn = await screen.findByRole("button", { name: "主题: 跟随系统" });
    fireEvent.click(btn);
    expect(useThemeStore.getState().mode).toBe("light");
  });

  it("shows the persistent update entry only after an update is available", async () => {
    const install = vi.fn();
    useUpdateStore.setState({
      status: "available",
      available: { version: "0.0.3", date: null, notes: "" },
      install,
    });
    render(<TitleBar />);
    fireEvent.click(await screen.findByRole("button", { name: "立即更新" }));
    expect(install).toHaveBeenCalledOnce();
  });

  it("maximize icon switches to restore when maximized", async () => {
    mockWindow.isMaximized.mockResolvedValueOnce(true);
    render(<TitleBar />);
    expect(
      await screen.findByRole("button", { name: "还原" }),
    ).toBeInTheDocument();
  });
});
