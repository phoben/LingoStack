import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { FavoritesView } from "./favorites-view";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useTtsStore } from "@/stores/tts-store";

const sonner = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: sonner }));

describe("FavoritesView", () => {
  const favorite = {
    id: "f-1",
    term: "TypeScript",
    meaning: "类型安全的 JavaScript",
    kind: "word" as const,
    source: "翻译" as const,
    createdAt: 1_788_048_000_000,
  };

  beforeEach(() => {
    useFavoritesStore.setState({
      list: [favorite],
      loading: false,
      loaded: true,
      error: null,
      load: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      importAll: vi.fn().mockResolvedValue(undefined),
    });
    useTtsStore.setState({
      status: "idle",
      text: null,
      error: null,
      speakText: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      clearError: vi.fn(),
    });
  });

  afterEach(cleanup);

  it("filters visible results and exposes speech and deletion by accessible name", async () => {
    render(<FavoritesView />);
    expect(await screen.findByText("TypeScript")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search terms or meanings…" }),
      {
        target: { value: "missing" },
      },
    );
    expect(screen.getByText("No matching favorites")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search terms or meanings…" }),
      {
        target: { value: "TypeScript" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Speak TypeScript" }));
    await waitFor(() =>
      expect(useTtsStore.getState().speakText).toHaveBeenCalledWith(
        "TypeScript",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete TypeScript" }));
    await waitFor(() =>
      expect(useFavoritesStore.getState().remove).toHaveBeenCalledWith("f-1"),
    );
  });

  it("leaves TTS failure presentation to the root notification boundary", async () => {
    useTtsStore.setState({ error: "audio unavailable" });
    render(<FavoritesView />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("only offers expansion for measured overflow and keeps row actions available", async () => {
    const longFavorite = {
      ...favorite,
      term: "https://example.test/" + "unbroken-path-segment/".repeat(24),
      meaning: "一段很长且没有空格的释义".repeat(24),
    };
    useFavoritesStore.setState({ list: [longFavorite] });

    let overflowing = false;
    const clientHeight = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(48);
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockImplementation(() => (overflowing ? 96 : 48));
    const observers: ResizeObserverCallback[] = [];
    const originalResizeObserver = globalThis.ResizeObserver;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    try {
      render(<FavoritesView />);
      expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();

      act(() => {
        overflowing = true;
        observers.forEach((callback) => callback([], {} as ResizeObserver));
      });

      const expand = await screen.findByRole("button", { name: "Show more" });
      expect(expand).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByRole("button", { name: `Speak ${longFavorite.term}` })).toBeEnabled();
      expect(screen.getByRole("button", { name: `Delete ${longFavorite.term}` })).toBeEnabled();

      fireEvent.click(expand);
      expect(expand).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Show less" }));
      expect(screen.getByRole("button", { name: "Show more" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    } finally {
      clientHeight.mockRestore();
      scrollHeight.mockRestore();
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });
});
