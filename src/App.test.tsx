import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";

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

import App from "./App";
import { defaultConfig } from "@/lib/config-types";
import { useAppStore } from "@/stores/app-store";
import { useConfigStore } from "@/stores/config-store";

describe("App desktop events", () => {
  beforeEach(() => {
    listeners.clear();
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
      selectionFeedback: null,
    });
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
        selectionFeedback: { kind: "clipboard" },
      });
    });
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
        selectionFeedback: null,
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
      expect(useAppStore.getState().selectionFeedback).toMatchObject({
        kind: "error",
        message: expect.stringContaining("手动粘贴"),
      });
    });
  });

  it("routes tray navigation without creating another window", async () => {
    render(<App />);
    await waitFor(() => expect(listeners.get("navigate-view")).toBeDefined());
    act(() => listeners.get("navigate-view")?.({ payload: "favorites" }));
    expect(useAppStore.getState().activeView).toBe("favorites");
  });
});
