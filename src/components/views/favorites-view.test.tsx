import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
    fireEvent.click(screen.getByRole("button", { name: "删除 TypeScript" }));
    await waitFor(() =>
      expect(useFavoritesStore.getState().remove).toHaveBeenCalledWith("f-1"),
    );
  });

  it("leaves TTS failure presentation to the root notification boundary", async () => {
    useTtsStore.setState({ error: "audio unavailable" });
    render(<FavoritesView />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
