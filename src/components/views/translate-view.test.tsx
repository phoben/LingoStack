import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useStreamStore } from "@/stores/stream-store";
import { useTtsStore } from "@/stores/tts-store";
import { useConfigStore } from "@/stores/config-store";
import { useAppStore } from "@/stores/app-store";
import { useOcrStore } from "@/stores/ocr-store";
import { defaultConfig } from "@/lib/config-types";

const sonner = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const clipboard = vi.hoisted(() => ({ writeText: vi.fn() }));
vi.mock("sonner", () => ({ toast: sonner }));

import { TermTags } from "@/components/term-tags";
import { positionTermTooltip } from "@/lib/term-tooltip-position";
import { TranslateView } from "./translate-view";

const terms = [
  {
    term: "GitHub Copilot",
    category: "product" as const,
    explanation: "AI 编程助手。",
  },
];

describe("TermTags", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("positions below when possible, otherwise flips above and clamps horizontally", () => {
    expect(
      positionTermTooltip(
        { left: 40, top: 20, bottom: 44 },
        { width: 160, height: 80 },
        { width: 400, height: 300 },
      ),
    ).toEqual({ left: 40, top: 52 });
    expect(
      positionTermTooltip(
        { left: 390, top: 250, bottom: 274 },
        { width: 160, height: 80 },
        { width: 400, height: 300 },
      ),
    ).toEqual({ left: 232, top: 162 });
  });

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
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("AI 编程助手。");
    expect(tooltip.parentElement).toBe(document.body);
    expect(tag).toHaveAttribute("aria-describedby");

    fireEvent.blur(tag);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(tag);
    expect(screen.getByRole("tooltip")).toHaveTextContent("AI 编程助手。");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps a persisted term favorited when a later translation changes its explanation", async () => {
    const toggle = vi.fn().mockResolvedValue(undefined);
    useFavoritesStore.setState({
      loaded: true,
      list: [
        {
          id: "saved-term",
          term: "GitHub Copilot",
          meaning: "用于代码补全的旧版说明。",
          kind: "phrase",
          source: "翻译",
          createdAt: 1,
        },
      ],
      toggle,
      error: null,
    });
    render(<TermTags terms={terms} />);
    const button = screen.getByRole("button", { name: "Remove favorite" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    await waitFor(() =>
      expect(toggle).toHaveBeenCalledWith(
        "GitHub Copilot",
        "AI 编程助手。",
        "翻译",
      ),
    );
    expect(sonner.success).toHaveBeenCalledWith("Favorite removed");
  });

  it("keeps bookmark controls disabled until persisted favorite state is available", () => {
    useFavoritesStore.setState({ loaded: false, list: [], toggle: vi.fn() });
    render(<TermTags terms={terms} />);
    expect(screen.getByRole("button", { name: "Favorite" })).toBeDisabled();
    expect(screen.getByLabelText("Contextual terms")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("presents and clears a favorite persistence failure once", async () => {
    const clearError = vi.fn(() => useFavoritesStore.setState({ error: null }));
    const toggle = vi.fn(async () =>
      useFavoritesStore.setState({ error: "disk unavailable" }),
    );
    useFavoritesStore.setState({
      loaded: true,
      list: [],
      toggle,
      clearError,
      error: null,
    });
    render(<TermTags terms={terms} />);

    fireEvent.click(screen.getByRole("button", { name: "Favorite" }));
    await waitFor(() =>
      expect(sonner.error).toHaveBeenCalledWith(
        "Could not save favorite: disk unavailable",
        expect.anything(),
      ),
    );
    expect(clearError).toHaveBeenCalledTimes(1);
    expect(useFavoritesStore.getState().error).toBeNull();
  });

  it("disables only pending terms and ignores rapid repeat clicks", async () => {
    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    const toggle = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const twoTerms = [
      ...terms,
      {
        term: "Rust",
        category: "programming" as const,
        explanation: "系统编程语言。",
      },
    ];
    useFavoritesStore.setState({ loaded: true, list: [], toggle, error: null });
    render(<TermTags terms={twoTerms} />);

    const [copilot, rust] = screen.getAllByRole("button", { name: "Favorite" });
    fireEvent.click(copilot);
    fireEvent.click(copilot);
    fireEvent.click(rust);

    expect(toggle).toHaveBeenCalledTimes(2);
    expect(copilot).toBeDisabled();
    expect(rust).toBeDisabled();

    resolveFirst?.();
    await waitFor(() => expect(copilot).toBeEnabled());
    expect(rust).toBeDisabled();
    resolveSecond?.();
    await waitFor(() => expect(rust).toBeEnabled());
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
    useConfigStore.setState({ config: defaultConfig() });
    useAppStore.setState({
      activeView: "translate",
      settingsSection: "general",
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

  it("为配置缺失提供 AI 设置入口，为普通错误保留重试", async () => {
    useStreamStore.setState((state) => ({
      tasks: {
        ...state.tasks,
        translate: {
          ...state.tasks.translate,
          status: "error",
          error: "AI_CONFIGURATION_MISSING",
          errorKind: "configuration",
        },
      },
    }));
    render(<TranslateView />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "AI configuration is required",
    );
    fireEvent.click(screen.getByRole("button", { name: "Set up AI" }));
    expect(useAppStore.getState()).toMatchObject({
      activeView: "settings",
      settingsSection: "ai",
    });

    act(() => {
      useStreamStore.setState((state) => ({
        tasks: {
          ...state.tasks,
          translate: {
            ...state.tasks.translate,
            error: "network unavailable",
            errorKind: "request",
          },
        },
      }));
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Set up AI" }),
    ).not.toBeInTheDocument();
  });
});

describe("TranslateView local OCR input", () => {
  const streamStart = vi.fn().mockResolvedValue(undefined);
  const cancelStream = vi.fn().mockResolvedValue(undefined);
  const startOcr = vi.fn().mockResolvedValue("识别后的文字");
  const cancelOcr = vi.fn().mockResolvedValue(undefined);
  const rejectOcr = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useConfigStore.setState({ config: defaultConfig() });
    useFavoritesStore.setState({ loaded: true, list: [] });
    useStreamStore.setState((state) => ({
      tasks: {
        ...state.tasks,
        translate: {
          ...state.tasks.translate,
          status: "idle",
          input: "已有文字",
          output: "",
          error: null,
        },
      },
      start: streamStart,
      cancel: cancelStream,
    }));
    useOcrStore.setState({
      status: "idle",
      error: null,
      requestId: null,
      start: startOcr,
      cancel: cancelOcr,
      reject: rejectOcr,
    });
  });
  afterEach(cleanup);

  function imageFile(type = "image/png"): File {
    return {
      type,
      size: 4,
      arrayBuffer: vi
        .fn()
        .mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer),
    } as unknown as File;
  }

  it("粘贴同时含图片和文字时图片优先，识别成功后自动翻译", async () => {
    const file = imageFile();
    render(<TranslateView />);
    const textarea = screen.getByRole("textbox");
    const dispatched = fireEvent.paste(textarea, {
      clipboardData: {
        items: [
          { kind: "string", type: "text/plain", getAsFile: () => null },
          { kind: "file", type: "image/png", getAsFile: () => file },
        ],
      },
    });

    expect(dispatched).toBe(false);
    await waitFor(() => expect(startOcr).toHaveBeenCalledTimes(1));
    expect(cancelStream).toHaveBeenCalledWith("translate", true);
    expect(streamStart).toHaveBeenCalledWith(
      "translate",
      "识别后的文字",
      expect.any(Function),
    );
  });

  it("纯文字粘贴保持浏览器默认行为，不触发 OCR", () => {
    render(<TranslateView />);
    const dispatched = fireEvent.paste(screen.getByRole("textbox"), {
      clipboardData: {
        items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
      },
    });

    expect(dispatched).toBe(true);
    expect(startOcr).not.toHaveBeenCalled();
  });

  it("多图粘贴拒绝且不读取任何图片", () => {
    render(<TranslateView />);
    fireEvent.paste(screen.getByRole("textbox"), {
      clipboardData: {
        items: [
          { kind: "file", type: "image/png", getAsFile: () => imageFile() },
          {
            kind: "file",
            type: "image/jpeg",
            getAsFile: () => imageFile("image/jpeg"),
          },
        ],
      },
    });

    expect(rejectOcr).toHaveBeenCalledWith(
      "Only one image can be recognized at a time",
    );
    expect(startOcr).not.toHaveBeenCalled();
  });

  it("拖入一张图片会识别，手动编辑会取消正在进行的 OCR", async () => {
    const file = imageFile("image/webp");
    render(<TranslateView />);
    const textarea = screen.getByRole("textbox");
    const sourcePane = textarea.closest("section");
    expect(sourcePane).not.toBeNull();

    fireEvent.drop(sourcePane!, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(startOcr).toHaveBeenCalledTimes(1));
    expect(startOcr).toHaveBeenCalledWith(
      { mediaType: "image/webp", content: new Uint8Array([1, 2, 3, 4]) },
      undefined,
    );

    fireEvent.change(textarea, { target: { value: "手动输入" } });
    expect(cancelOcr).toHaveBeenCalled();
    expect(useStreamStore.getState().tasks.translate.input).toBe("手动输入");
  });

  it("拖到译文侧也会交给同一个图片识别流程", async () => {
    const file = imageFile("image/png");
    render(<TranslateView />);
    const translatedPane = screen.getByText("Translation").closest("section");
    expect(translatedPane).not.toBeNull();

    fireEvent.drop(translatedPane!, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(startOcr).toHaveBeenCalledTimes(1));
    expect(startOcr).toHaveBeenCalledWith(
      { mediaType: "image/png", content: new Uint8Array([1, 2, 3, 4]) },
      undefined,
    );
  });

  it("旧图片读取较慢时不会反向覆盖后选择的图片", async () => {
    let resolveSlow!: (value: ArrayBuffer) => void;
    const slowFile = {
      type: "image/png",
      size: 4,
      arrayBuffer: vi.fn(
        () =>
          new Promise<ArrayBuffer>((resolve) => {
            resolveSlow = resolve;
          }),
      ),
    } as unknown as File;
    const fastFile = imageFile("image/jpeg");
    render(<TranslateView />);
    const textarea = screen.getByRole("textbox");

    fireEvent.paste(textarea, {
      clipboardData: {
        items: [{ kind: "file", type: "image/png", getAsFile: () => slowFile }],
      },
    });
    await waitFor(() => expect(slowFile.arrayBuffer).toHaveBeenCalled());
    fireEvent.drop(textarea.closest("section")!, {
      dataTransfer: { files: [fastFile] },
    });
    await waitFor(() => expect(startOcr).toHaveBeenCalledTimes(1));

    resolveSlow(new Uint8Array([9, 9, 9, 9]).buffer);
    await act(async () => Promise.resolve());
    expect(startOcr).toHaveBeenCalledTimes(1);
    expect(startOcr).toHaveBeenCalledWith(
      { mediaType: "image/jpeg", content: new Uint8Array([1, 2, 3, 4]) },
      undefined,
    );
  });
});
