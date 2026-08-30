import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { toast } from "sonner";

const listeners = new Map<string, (event: { payload: unknown }) => void>();
const { getSelection, registerHotkeys } = vi.hoisted(() => ({
  getSelection: vi.fn(),
  registerHotkeys: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    (name: string, handler: (event: { payload: unknown }) => void) => {
      listeners.set(name, handler);
      return Promise.resolve(vi.fn());
    },
  ),
}));
vi.mock("@/lib/ipc", () => ({ getSelection, registerHotkeys }));
vi.mock("@/components/title-bar", () => ({ TitleBar: () => null }));
vi.mock("@/components/sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/views/about-view", () => ({ AboutView: () => null }));
vi.mock("@/components/views/docs-view", () => ({ DocsView: () => null }));
vi.mock("@/components/views/favorites-view", () => ({
  FavoritesView: () => null,
}));
vi.mock("@/components/views/naming-view", () => ({ NamingView: () => null }));
vi.mock("@/components/views/settings-view", () => ({
  SettingsView: () => null,
}));
vi.mock("@/components/views/translate-view", () => ({
  TranslateView: () => null,
}));
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

import App from "./App";
import { defaultConfig } from "@/lib/config-types";
import { useAppStore } from "@/stores/app-store";
import { useConfigStore } from "@/stores/config-store";
import { useTtsStore } from "@/stores/tts-store";
import defaultCapability from "../src-tauri/capabilities/default.json";

describe("App desktop events", () => {
  beforeEach(() => {
    listeners.clear();
    vi.mocked(toast.info).mockClear();
    vi.mocked(toast.error).mockClear();
    getSelection.mockReset();
    registerHotkeys.mockReset();
    registerHotkeys.mockResolvedValue([]);
    useConfigStore.setState({
      config: defaultConfig(),
      loading: false,
      error: null,
      load: vi.fn().mockResolvedValue(undefined),
    });
    useAppStore.setState({
      activeView: "naming",
      injectSource: null,
    });
    useTtsStore.setState({ error: null, clearError: vi.fn() });
  });

  it("routes clipboard fallback selection into the existing translate view", async () => {
    getSelection.mockResolvedValue({
      text: "clipboard text",
      source: "clipboard",
    });
    render(<App />);
    await waitFor(() =>
      expect(listeners.get("translate-selection")).toBeDefined(),
    );
    await act(async () => {
      listeners.get("translate-selection")?.({ payload: undefined });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(useAppStore.getState()).toMatchObject({
        activeView: "translate",
        injectSource: "clipboard text",
      });
    });
    expect(toast.info).toHaveBeenCalledWith(
      "The accessibility selection was unavailable, so the clipboard text was used.",
    );
  });

  it("uses the selection captured before the main window takes focus", async () => {
    render(<App />);
    await waitFor(() =>
      expect(listeners.get("translate-selection")).toBeDefined(),
    );
    act(() =>
      listeners.get("translate-selection")?.({
        payload: {
          selection: { text: "UIA selected text", source: "accessibility" },
        },
      }),
    );

    await waitFor(() => {
      expect(useAppStore.getState()).toMatchObject({
        activeView: "translate",
        injectSource: "UIA selected text",
      });
    });
    expect(getSelection).not.toHaveBeenCalled();
  });

  it("preserves manual input recovery guidance when selection fails", async () => {
    getSelection.mockRejectedValue("clipboard unavailable");
    render(<App />);
    await waitFor(() =>
      expect(listeners.get("translate-selection")).toBeDefined(),
    );
    await act(async () => {
      listeners.get("translate-selection")?.({ payload: undefined });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Paste text manually"),
        expect.anything(),
      );
    });
  });

  it("presents a TTS failure once at the root notification boundary", async () => {
    const clearError = vi.fn();
    useTtsStore.setState({ error: "audio unavailable", clearError });
    render(<App />);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Speech failed: audio unavailable",
        expect.anything(),
      ),
    );
    expect(clearError).toHaveBeenCalledOnce();
  });

  it("routes tray navigation without creating another window", async () => {
    render(<App />);
    await waitFor(() => expect(listeners.get("navigate-view")).toBeDefined());
    act(() => listeners.get("navigate-view")?.({ payload: "favorites" }));
    expect(useAppStore.getState().activeView).toBe("favorites");
  });

  it("suppresses the WebView native context menu while retaining the dialog message capability", () => {
    render(<App />);
    const event = new MouseEvent("contextmenu", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(defaultCapability.permissions).toContain("dialog:allow-message");
  });
});
