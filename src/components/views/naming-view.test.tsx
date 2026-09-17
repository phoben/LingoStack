import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStreamStore } from "@/stores/stream-store";
import { useConfigStore } from "@/stores/config-store";
import { useAppStore } from "@/stores/app-store";
import { defaultConfig } from "@/lib/config-types";

const sonner = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const clipboard = vi.hoisted(() => ({ writeText: vi.fn() }));

vi.mock("sonner", () => ({ toast: sonner }));

import { NamingView } from "./naming-view";

describe("NamingView copy feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    useStreamStore.setState((state) => ({
      tasks: {
        ...state.tasks,
        naming: {
          ...state.tasks.naming,
          status: "done",
          output: "user profile",
          error: null,
        },
      },
    }));
    useConfigStore.setState({ config: defaultConfig() });
    useAppStore.setState({ activeView: "naming", settingsSection: "general" });
  });

  it("waits for the Clipboard result before notifying success or failure", async () => {
    clipboard.writeText.mockResolvedValueOnce(undefined);
    render(<NamingView />);
    const copy = screen.getByRole("button", { name: "Copy userProfile" });

    fireEvent.click(copy);
    await waitFor(() => expect(sonner.success).toHaveBeenCalledWith("Copied"));

    clipboard.writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(copy);
    await waitFor(() =>
      expect(sonner.error).toHaveBeenCalledWith(
        "Copy failed: denied",
        expect.anything(),
      ),
    );
  });

  it("为配置缺失提供 AI 设置入口，为普通错误保留重试", () => {
    useStreamStore.setState((state) => ({
      tasks: {
        ...state.tasks,
        naming: {
          ...state.tasks.naming,
          status: "error",
          error: "AI_CONFIGURATION_MISSING",
          errorKind: "configuration",
        },
      },
    }));
    render(<NamingView />);

    fireEvent.click(screen.getByRole("button", { name: "Set up AI" }));
    expect(useAppStore.getState()).toMatchObject({
      activeView: "settings",
      settingsSection: "ai",
    });

    act(() => {
      useStreamStore.setState((state) => ({
        tasks: {
          ...state.tasks,
          naming: {
            ...state.tasks.naming,
            error: "network unavailable",
            errorKind: "request",
          },
        },
      }));
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
