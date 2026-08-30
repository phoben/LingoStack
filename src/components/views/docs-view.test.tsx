import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  confirm: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
  readFile: vi.fn(),
  writeTextFile: vi.fn(),
}));
const ipc = vi.hoisted(() => ({
  documentContent: vi.fn(),
  documentLimits: vi.fn(),
  listDocuments: vi.fn(),
  importDocument: vi.fn(),
  translateDocument: vi.fn(),
  cancelDocument: vi.fn(),
}));
const clipboard = vi.hoisted(() => ({ writeText: vi.fn() }));
const sonner = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}));
const records = vi.hoisted(() => [
  {
    id: "doc",
    file_name: "scan.pdf",
    status: "partial_failed" as const,
    block_count: 4,
    translated_count: 2,
  },
  {
    id: "done",
    file_name: "done.md",
    status: "completed" as const,
    block_count: 1,
    translated_count: 1,
  },
]);
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: native.confirm,
  open: native.open,
  save: native.save,
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: native.readFile,
  writeTextFile: native.writeTextFile,
}));
vi.mock("@/lib/ipc", () => ({
  listDocuments: ipc.listDocuments,
  importDocument: ipc.importDocument,
  deleteDocument: vi.fn(),
  translateDocument: ipc.translateDocument,
  pauseDocument: vi.fn(),
  cancelDocument: ipc.cancelDocument,
  documentContent: ipc.documentContent,
  documentLimits: ipc.documentLimits,
}));
vi.mock("sonner", () => ({ toast: sonner }));
import { DocsView } from "./docs-view";
import { defaultConfig } from "@/lib/config-types";
import { useDocumentStore } from "@/stores/document-store";
import { useConfigStore } from "@/stores/config-store";
import { deleteDocument } from "@/lib/ipc";

describe("DocsView continuous Markdown reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConfigStore.setState({ config: defaultConfig() });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    ipc.documentLimits.mockResolvedValue({
      max_input_bytes: 52_428_800,
      max_text_chars: 100_000,
    });
    ipc.listDocuments.mockResolvedValue(records);
    ipc.translateDocument.mockResolvedValue(undefined);
    ipc.cancelDocument.mockResolvedValue(undefined);
    ipc.documentContent.mockImplementation((_: string, view: string) =>
      Promise.resolve(
        view === "translation"
          ? {
              markdown:
                "# Translation\n\n> Readable\n\n| A | B |\n| - | - |\n| 1 | 2 |",
              complete: false,
              missing_parts: 2,
            }
          : {
              markdown: "# Source\n\n- item\n\n`code`",
              complete: true,
              missing_parts: 0,
            },
      ),
    );
    useDocumentStore.setState({
      documents: records,
      selectedId: "doc",
      loading: false,
      error: null,
    });
  });
  it("defaults to source and renders semantic continuous Markdown without block UI", async () => {
    render(<DocsView />);
    expect(
      await screen.findByRole("heading", { name: "Source" }),
    ).toBeInTheDocument();
    expect(screen.getByText("item")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Source" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(ipc.documentContent).toHaveBeenCalledWith("doc", "source");
    const scanItem = screen.getByRole("button", {
      name: "scan.pdf: Needs attention",
    });
    expect(scanItem).toBeInTheDocument();
    expect(scanItem).not.toHaveTextContent("Needs attention");
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
    expect(screen.queryByText("Document records")).not.toBeInTheDocument();
    expect(screen.queryByText(/Needs attention · 50%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/structure block/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Contextual terms/i)).not.toBeInTheDocument();
  });

  it("keeps the source visible while a translation is pending", async () => {
    const pending = {
      id: "pending",
      file_name: "pending.md",
      status: "translating" as const,
      block_count: 2,
      translated_count: 0,
    };
    ipc.listDocuments.mockResolvedValue([pending]);
    ipc.documentContent.mockImplementation((_: string, view: string) =>
      Promise.resolve(
        view === "source"
          ? {
              markdown: "# 原文标题\n\n原文段落",
              complete: true,
              missing_parts: 0,
            }
          : { markdown: "> [未翻译]", complete: false, missing_parts: 2 },
      ),
    );
    useDocumentStore.setState({
      documents: [pending],
      selectedId: "pending",
    });

    render(<DocsView />);

    expect(await screen.findByRole("heading", { name: "原文标题" })).toBeInTheDocument();
    expect(screen.getByText("原文段落")).toBeInTheDocument();
    expect(ipc.documentContent).toHaveBeenCalledWith("pending", "source");
    expect(
      screen.getByRole("button", { name: "pending.md: Translating" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("[未翻译]")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Translation" }));
    await waitFor(() =>
      expect(ipc.documentContent).toHaveBeenCalledWith("pending", "translation"),
    );
    expect(screen.queryByText("[未翻译]")).not.toBeInTheDocument();
    expect(screen.queryByText("原文段落")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Translating");
    expect(screen.getByRole("status")).toHaveClass("absolute", "inset-0");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status").parentElement?.parentElement).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("announces a durable failed-translation reason once through toast without an inline alert", async () => {
    const failed = {
      id: "failed",
      file_name: "failed.md",
      status: "failed" as const,
      block_count: 1,
      translated_count: 0,
      error_message: "Provider returned 401: invalid credentials",
    };
    ipc.listDocuments.mockResolvedValue([failed]);
    ipc.documentContent.mockResolvedValue({
      markdown: "",
      complete: false,
      missing_parts: 1,
    });
    useDocumentStore.setState({
      documents: [failed],
      selectedId: "failed",
      error: null,
    });

    render(<DocsView />);

    await waitFor(() =>
      expect(sonner.error).toHaveBeenCalledWith(
        "Provider returned 401: invalid credentials",
        expect.anything(),
      ),
    );
    expect(sonner.error).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Translating")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("announces the same reason again when a retry enters a new failure cycle", async () => {
    const failed = {
      id: "failed-again",
      file_name: "failed-again.md",
      status: "failed" as const,
      block_count: 1,
      translated_count: 0,
      error_message: "response body read failed",
    };
    ipc.listDocuments.mockResolvedValue([failed]);
    ipc.documentContent.mockResolvedValue({
      markdown: "",
      complete: false,
      missing_parts: 1,
    });
    useDocumentStore.setState({
      documents: [failed],
      selectedId: failed.id,
      error: null,
    });

    render(<DocsView />);

    await waitFor(() => expect(sonner.error).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useDocumentStore.getState().loading).toBe(false));
    await act(async () => {
      useDocumentStore.setState({
        documents: [
          { ...failed, status: "translating", error_message: undefined },
        ],
      });
    });
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    await act(async () => {
      useDocumentStore.setState({ documents: [failed] });
    });
    await waitFor(() => expect(sonner.error).toHaveBeenCalledTimes(2));
  });

  it("gives an older failed record a retryable fallback reason", async () => {
    const failed = {
      id: "legacy-failed",
      file_name: "legacy-failed.md",
      status: "failed" as const,
      block_count: 1,
      translated_count: 0,
    };
    ipc.listDocuments.mockResolvedValue([failed]);
    ipc.documentContent.mockResolvedValue({
      markdown: "",
      complete: false,
      missing_parts: 1,
    });
    useDocumentStore.setState({
      documents: [failed],
      selectedId: "legacy-failed",
      error: null,
    });

    render(<DocsView />);

    await waitFor(() =>
      expect(sonner.error).toHaveBeenCalledWith(
        "No specific failure reason was recorded. Please retry.",
        expect.anything(),
      ),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Translating")).not.toBeInTheDocument();
  });

  it("localizes an older failed record's missing reason", async () => {
    const failed = {
      id: "legacy-failed-zh",
      file_name: "legacy-failed.md",
      status: "failed" as const,
      block_count: 1,
      translated_count: 0,
    };
    ipc.listDocuments.mockResolvedValue([failed]);
    useConfigStore.setState({
      config: { ...defaultConfig(), ui_language: "zh" },
    });
    useDocumentStore.setState({
      documents: [failed],
      selectedId: "legacy-failed-zh",
      error: null,
    });

    render(<DocsView />);

    await waitFor(() =>
      expect(sonner.error).toHaveBeenCalledWith(
        "未记录具体失败原因，请重试。",
        expect.anything(),
      ),
    );
  });

  it("announces a synchronous retry setup failure through toast", async () => {
    const failed = {
      id: "setup-failed",
      file_name: "setup-failed.md",
      status: "failed" as const,
      block_count: 1,
      translated_count: 0,
      error_message: "No document model is configured",
    };
    ipc.translateDocument.mockRejectedValueOnce(
      new Error("No document model is configured"),
    );
    ipc.listDocuments.mockResolvedValue([failed]);
    useDocumentStore.setState({
      documents: [failed],
      selectedId: "setup-failed",
      error: null,
    });

    render(<DocsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(sonner.error).toHaveBeenCalledWith(
        "No document model is configured",
        expect.anything(),
      ),
    );
  });

  it("offers only cancellation while a document is translating", async () => {
    const translating = {
      ...records[0],
      status: "translating" as const,
      translated_count: 0,
    };
    ipc.listDocuments.mockResolvedValue([translating]);
    useDocumentStore.setState({ documents: [translating], selectedId: "doc" });

    render(<DocsView />);

    const cancel = await screen.findByRole("button", { name: "Cancel" });
    expect(
      screen.queryByRole("button", { name: "Pause" }),
    ).not.toBeInTheDocument();
    fireEvent.click(cancel);
    await waitFor(() => expect(ipc.cancelDocument).toHaveBeenCalledWith("doc"));
  });

  it.each(["paused", "pausing"] as const)(
    "presents %s compatibility state as cancelled and retryable",
    async (status) => {
      const cancelled = { ...records[0], status, translated_count: 0 };
      ipc.listDocuments.mockResolvedValue([cancelled]);
      useDocumentStore.setState({ documents: [cancelled], selectedId: "doc" });

      render(<DocsView />);

      expect(
        await screen.findByRole("button", { name: "scan.pdf: Cancelled" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Pause" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Continue" }),
      ).not.toBeInTheDocument();
    },
  );
  it("switches to source Markdown and puts the import action beside the reader mode switch", async () => {
    render(<DocsView />);
    await screen.findByRole("heading", { name: "Source" });
    fireEvent.click(screen.getByRole("radio", { name: "Translation" }));
    expect(
      screen.getByRole("radio", { name: "Translation" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Source" }));
    expect(
      await screen.findByRole("heading", { name: "Source" }),
    ).toBeInTheDocument();
    expect(screen.getByText("item")).toBeInTheDocument();
    const sourceToggle = screen.getByRole("radiogroup", {
      name: "Document reading mode",
    });
    const importButton = screen.getByRole("button", { name: "Import document" });
    expect(sourceToggle.compareDocumentPosition(importButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(importButton.parentElement).not.toHaveClass("border-t");
  });

  it("starts every selected document independently, keeps a rejected file visible, and marks active records", async () => {
    native.open.mockResolvedValue(["C:\\tmp\\one.md", "C:\\tmp\\two.md"]);
    native.readFile.mockResolvedValue(new Uint8Array([1]));
    ipc.importDocument
      .mockResolvedValueOnce({
        type: "imported",
        data: {
          id: "one",
          file_name: "one.md",
          status: "translating",
          block_count: 1,
          translated_count: 0,
        },
      })
      .mockResolvedValueOnce({
        type: "rejected",
        message: "unsupported",
      });
    const working = {
      id: "working",
      file_name: "working.md",
      status: "translating" as const,
      block_count: 1,
      translated_count: 0,
    };
    ipc.listDocuments.mockResolvedValue([working]);
    useDocumentStore.setState({
      documents: [working],
      selectedId: "working",
    });

    render(<DocsView />);
    fireEvent.click(screen.getByRole("button", { name: "Import document" }));

    await waitFor(() => expect(ipc.importDocument).toHaveBeenCalledTimes(2));
    expect(native.open).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: true }),
    );
    expect(ipc.translateDocument).toHaveBeenCalledWith("one");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("document-spinner")).toBeInTheDocument();
    await waitFor(() =>
      expect(sonner.error).toHaveBeenCalledWith(
        "Import failed: unsupported",
        expect.anything(),
      ),
    );
    expect(useDocumentStore.getState().error).toBeNull();
  });
  it("does not export an incomplete translation", async () => {
    render(<DocsView />);
    await screen.findByRole("heading", { name: "Source" });
    fireEvent.click(screen.getByRole("radio", { name: "Translation" }));
    await waitFor(() =>
      expect(ipc.documentContent).toHaveBeenCalledWith("doc", "translation"),
    );
    const exportButton = screen.getByRole("button", {
      name: "Export document",
    });
    await waitFor(() => expect(exportButton).not.toBeDisabled());
    fireEvent.click(exportButton);
    expect(native.save).not.toHaveBeenCalled();
    expect(native.writeTextFile).not.toHaveBeenCalled();
    expect(sonner.info).toHaveBeenCalledWith("Translating");
  });

  it("names the copy action for the active document view", async () => {
    render(<DocsView />);
    await screen.findByRole("heading", { name: "Source" });
    expect(
      screen.getByRole("button", { name: "Copy current source document" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Translation" }));
    await waitFor(() =>
      expect(ipc.documentContent).toHaveBeenCalledWith("doc", "translation"),
    );
    expect(
      screen.getByRole("button", { name: "Copy current translation" }),
    ).toBeInTheDocument();
  });

  it("uses roving radio focus and arrow keys to switch the reader mode", async () => {
    render(<DocsView />);
    const source = await screen.findByRole("radio", { name: "Source" });
    const translation = screen.getByRole("radio", { name: "Translation" });
    expect(source).toHaveAttribute("tabindex", "0");
    expect(translation).toHaveAttribute("tabindex", "-1");
    expect(source.compareDocumentPosition(translation)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    source.focus();
    await act(async () => {
      fireEvent.keyDown(source, { key: "ArrowRight" });
    });
    expect(translation).toHaveFocus();
    expect(translation).toHaveAttribute("aria-checked", "true");
    expect(translation).toHaveAttribute("tabindex", "0");
    expect(source).toHaveAttribute("tabindex", "-1");
    await act(async () => {
      fireEvent.keyDown(translation, { key: "Home" });
    });
    expect(source).toHaveFocus();
    expect(source).toHaveAttribute("aria-checked", "true");
    await act(async () => {
      fireEvent.keyDown(source, { key: "End" });
    });
    expect(translation).toHaveFocus();
    expect(translation).toHaveAttribute("aria-checked", "true");
  });

  it("chooses a completed document's translation and every other selected document's source", async () => {
    const translating = {
      id: "working",
      file_name: "working.md",
      status: "translating" as const,
      block_count: 1,
      translated_count: 0,
    };
    const completed = {
      id: "complete",
      file_name: "complete.md",
      status: "completed" as const,
      block_count: 1,
      translated_count: 1,
    };
    const failed = {
      id: "failed-selection",
      file_name: "failed-selection.md",
      status: "failed" as const,
      block_count: 1,
      translated_count: 0,
    };
    ipc.documentContent.mockImplementation((id: string, nextView: string) =>
      Promise.resolve({
        markdown: `# ${id} ${nextView}`,
        complete: nextView === "source" || id === completed.id,
        missing_parts: 0,
      }),
    );
    useDocumentStore.setState({
      documents: [translating, completed, failed],
      selectedId: translating.id,
    });
    ipc.listDocuments.mockResolvedValue([translating, completed, failed]);

    render(<DocsView />);
    await screen.findByRole("heading", { name: "working source" });

    ipc.documentContent.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "complete.md: Complete" }));
    expect(await screen.findByRole("heading", { name: "complete translation" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Translation" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(ipc.documentContent).toHaveBeenCalledTimes(1);
    expect(ipc.documentContent).toHaveBeenCalledWith(completed.id, "translation");

    ipc.documentContent.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: "failed-selection.md: Error" }),
    );
    expect(await screen.findByRole("heading", { name: "failed-selection source" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Source" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(ipc.documentContent).toHaveBeenCalledTimes(1);
    expect(ipc.documentContent).toHaveBeenCalledWith(failed.id, "source");
  });

  it("automatically opens the translation reader after an import starts and replaces its loading overlay with the completed result", async () => {
    const translating = {
      id: "new-document",
      file_name: "new-document.md",
      status: "translating" as const,
      block_count: 1,
      translated_count: 0,
    };
    let completed = false;
    ipc.documentContent.mockImplementation((_: string, nextView: string) =>
      Promise.resolve(
        nextView === "translation"
          ? {
              markdown: completed ? "# Completed translation" : "> [unfinished]",
              complete: completed,
              missing_parts: completed ? 0 : 1,
            }
          : { markdown: "# Source should stay hidden", complete: true, missing_parts: 0 },
      ),
    );
    native.open.mockResolvedValue(["C:\\tmp\\new-document.md"]);
    native.readFile.mockResolvedValue(new Uint8Array([1]));
    ipc.importDocument.mockResolvedValue({ type: "imported", data: translating });
    ipc.listDocuments.mockResolvedValue([translating]);
    useDocumentStore.setState({ documents: [], selectedId: null });

    render(<DocsView />);
    fireEvent.click(screen.getByRole("button", { name: "Import document" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Translating");
    expect(screen.getByRole("radio", { name: "Translation" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.queryByText("[unfinished]")).not.toBeInTheDocument();
    expect(screen.queryByText("Source should stay hidden")).not.toBeInTheDocument();

    ipc.documentContent.mockClear();
    completed = true;
    await act(async () => {
      useDocumentStore.setState({
        documents: [{ ...translating, status: "completed", translated_count: 1 }],
      });
    });
    expect(
      await screen.findByRole("heading", { name: "Completed translation" }),
    ).toBeInTheDocument();
    expect(ipc.documentContent).toHaveBeenCalledTimes(1);
    expect(ipc.documentContent).toHaveBeenCalledWith(
      translating.id,
      "translation",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps a manually selected reader mode when the current record updates", async () => {
    const completed = {
      id: "manual-mode",
      file_name: "manual-mode.md",
      status: "completed" as const,
      block_count: 1,
      translated_count: 1,
    };
    useDocumentStore.setState({ documents: [completed], selectedId: completed.id });
    ipc.listDocuments.mockResolvedValue([completed]);

    render(<DocsView />);
    fireEvent.click(screen.getByRole("radio", { name: "Translation" }));
    await waitFor(() =>
      expect(ipc.documentContent).toHaveBeenCalledWith(completed.id, "translation"),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Source" }));
    await waitFor(() =>
      expect(ipc.documentContent).toHaveBeenCalledWith(completed.id, "source"),
    );

    await act(async () => {
      useDocumentStore.setState({
        documents: [{ ...completed, translated_count: 2 }],
      });
    });

    expect(screen.getByRole("radio", { name: "Source" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("does not mark a source reader busy for unrelated document-store loading", async () => {
    render(<DocsView />);
    const article = await screen.findByRole("article");
    await act(async () => {
      useDocumentStore.setState({ loading: true });
    });

    expect(article.closest("section")).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each(["paused", "unsupported"] as const)(
    "does not leave the translation reader in a loading state after %s",
    async (status) => {
      const inactive = {
        id: `inactive-${status}`,
        file_name: `inactive-${status}.md`,
        status,
        block_count: 1,
        translated_count: 0,
      };
      useDocumentStore.setState({ documents: [inactive], selectedId: inactive.id });
      ipc.listDocuments.mockResolvedValue([inactive]);

      render(<DocsView />);
      fireEvent.click(screen.getByRole("radio", { name: "Translation" }));

      const message = status === "paused" ? "Cancelled" : "Not supported yet";
      expect(await screen.findAllByText(message)).not.toHaveLength(0);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      const readerSection =
        status === "unsupported"
          ? screen.getByRole("alert").closest("section")
          : screen.getByText(message).closest("section");
      expect(readerSection).toHaveAttribute(
        "aria-busy",
        "false",
      );
    },
  );

  it("clears and ignores stale content while switching documents", async () => {
    let resolveFirst:
      | ((value: {
          markdown: string;
          complete: boolean;
          missing_parts: number;
        }) => void)
      | undefined;
    ipc.documentContent.mockImplementation((id: string) => {
      if (id === "doc")
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      return Promise.resolve({
        markdown: "# Current document",
        complete: true,
        missing_parts: 0,
      });
    });
    render(<DocsView />);
    await waitFor(() =>
      expect(ipc.documentContent).toHaveBeenCalledWith("doc", "source"),
    );
    fireEvent.click(screen.getByRole("button", { name: "done.md: Complete" }));
    expect(
      await screen.findByRole("heading", { name: "Current document" }),
    ).toBeInTheDocument();
    expect(ipc.documentContent).toHaveBeenCalledWith("done", "translation");
    resolveFirst?.({
      markdown: "# Stale document",
      complete: true,
      missing_parts: 0,
    });
    await Promise.resolve();
    expect(
      screen.queryByRole("heading", { name: "Stale document" }),
    ).not.toBeInTheDocument();
  });

  it("deletes only after both confirmations and falls back to the remaining record", async () => {
    native.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    render(<DocsView />);
    await screen.findByRole("heading", { name: "Source" });

    fireEvent.click(
      screen.getByRole("button", { name: "Delete document record" }),
    );

    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith("doc"));
    expect(useDocumentStore.getState()).toMatchObject({
      selectedId: "done",
      documents: [expect.objectContaining({ id: "done" })],
    });
  });

  it("does not delete when either confirmation is declined and reports dialog failures", async () => {
    native.confirm.mockResolvedValueOnce(false);
    render(<DocsView />);
    await screen.findByRole("heading", { name: "Source" });
    fireEvent.click(
      screen.getByRole("button", { name: "Delete document record" }),
    );
    await waitFor(() => expect(native.confirm).toHaveBeenCalledTimes(1));
    expect(deleteDocument).not.toHaveBeenCalled();

    native.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Delete document record" }),
    );
    await waitFor(() => expect(native.confirm).toHaveBeenCalledTimes(3));
    expect(deleteDocument).not.toHaveBeenCalled();

    native.confirm.mockRejectedValueOnce(new Error("confirm unavailable"));
    fireEvent.click(
      screen.getByRole("button", { name: "Delete document record" }),
    );
    await waitFor(() =>
      expect(sonner.error).toHaveBeenCalledWith(
        "Action failed: confirm unavailable",
        expect.anything(),
      ),
    );
  });

  it("offers keyboard-dismissable app-native menus for document rows and the reader", async () => {
    render(<DocsView />);
    await screen.findByRole("heading", { name: "Source" });
    await act(async () => {
      fireEvent.contextMenu(screen.getByRole("article"), {
        clientX: 10,
        clientY: 10,
      });
    });
    expect(
      screen.getByRole("menuitem", { name: "Select all" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menu")).toHaveAccessibleName(
      "Document reader actions",
    );
    expect(
      screen.getByRole("menuitem", { name: "Copy current source document" }),
    ).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "End" });
    expect(screen.getByRole("menuitem", { name: "Select all" })).toHaveFocus();
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.contextMenu(screen.getByRole("button", { name: /done\.md/ }), {
        clientX: 10,
        clientY: 10,
      });
    });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menu")).toHaveAccessibleName(
      "Document record actions",
    );
    expect(
      screen
        .getAllByRole("menuitem")
        .slice(0, 2)
        .map((item) => item.textContent),
    ).toEqual(["Source", "Translation"]);
    expect(screen.getByRole("radio", { name: "Source" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("menuitem", { name: "Delete document record" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Translation" }));
    await waitFor(() =>
      expect(ipc.documentContent).toHaveBeenCalledWith("done", "translation"),
    );
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("copies the reader selection captured when its menu opens", async () => {
    render(<DocsView />);
    const article = await screen.findByRole("article");
    const selectedNode = article.querySelector("h1")?.firstChild;
    if (!selectedNode) throw new Error("expected heading text");
    const selection = vi.spyOn(window, "getSelection");
    selection.mockReturnValue({
      anchorNode: selectedNode,
      focusNode: selectedNode,
      toString: () => "captured selection",
    } as unknown as Selection);
    fireEvent.contextMenu(article, { clientX: 10, clientY: 10 });
    selection.mockReturnValue({
      anchorNode: selectedNode,
      focusNode: selectedNode,
      toString: () => "changed selection",
    } as unknown as Selection);
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy selection" }));
    await waitFor(() =>
      expect(clipboard.writeText).toHaveBeenCalledWith("captured selection"),
    );
  });
});
