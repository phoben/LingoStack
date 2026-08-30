import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useStreamStore } from "@/stores/stream-store";
import { useTtsStore } from "@/stores/tts-store";

const sonner = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const clipboard = vi.hoisted(() => ({ writeText: vi.fn() }));
vi.mock("sonner", () => ({ toast: sonner }));

import { TermTags, TranslateView } from "./translate-view";

const terms = [
  {
    term: "GitHub Copilot",
    category: "product" as const,
    explanation: "AI 编程助手。",
  },
];

describe("TermTags", () => {
  it("does not render an empty landmark when metadata is absent or invalid", () => {
    const { container } = render(<TermTags terms={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText("上下文术语")).not.toBeInTheDocument();
  });

  it("discloses an explanation on keyboard focus and hover", () => {
    render(<TermTags terms={terms} />);
    const tag = screen.getByRole("button", { name: "GitHub Copilot" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(tag);
    expect(screen.getByRole("tooltip")).toHaveTextContent("AI 编程助手。");
    expect(tag).toHaveAttribute("aria-describedby");

    fireEvent.blur(tag);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(tag);
    expect(screen.getByRole("tooltip")).toHaveTextContent("AI 编程助手。");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("TranslateView toast feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    useStreamStore.setState((state) => ({
      tasks: {
        ...state.tasks,
        translate: {
          ...state.tasks.translate,
          status: "done",
          input: "source text",
          output: "translated text",
          error: null,
          terms: [],
        },
      },
    }));
    useFavoritesStore.setState({
      error: null,
      add: vi.fn().mockResolvedValue(undefined),
    });
    useTtsStore.setState({
      status: "idle",
      text: null,
      error: null,
      speakText: vi.fn(),
      stop: vi.fn(),
    });
  });

  it("waits for clipboard success and surfaces a rejected favorite once", async () => {
    clipboard.writeText.mockResolvedValueOnce(undefined);
    render(<TranslateView />);

    fireEvent.click(screen.getByRole("button", { name: "Copy Source" }));
    await waitFor(() => expect(sonner.success).toHaveBeenCalledWith("Copied"));

    useFavoritesStore.setState({ error: "disk unavailable" });
    fireEvent.click(screen.getAllByRole("button", { name: "Favorite" })[0]);
    await waitFor(() =>
      expect(sonner.error).toHaveBeenCalledWith(
        "Could not save favorite: disk unavailable",
        expect.anything(),
      ),
    );
    expect(useFavoritesStore.getState().error).toBeNull();
  });
});
