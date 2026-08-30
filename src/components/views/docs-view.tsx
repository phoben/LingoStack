import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  Copy,
  Download,
  FileText,
  LoaderCircle,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  type ContextMenuItem,
} from "@/components/ui/context-menu";
import type {
  DocumentContent,
  DocumentStatus,
  DocumentView,
} from "@/lib/document-types";
import { documentContent } from "@/lib/ipc";
import {
  type DocumentListFilter,
  matchesDocumentFilter,
} from "@/lib/document-utils";
import { useT } from "@/lib/i18n";
import { cn, stringifyError } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { toast } from "sonner";

const DOCUMENT_FILTERS = [
  { name: "Documents", extensions: ["md", "markdown", "pdf", "docx"] },
];
const filters: ReadonlyArray<{
  id: DocumentListFilter;
  label: "all" | "active" | "attention" | "completedDocuments";
}> = [
  { id: "all", label: "all" },
  { id: "active", label: "active" },
  { id: "attention", label: "attention" },
  { id: "completed", label: "completedDocuments" },
];
const statusKey: Record<
  DocumentStatus,
  | "pending"
  | "translatingDocument"
  | "cancelled"
  | "attention"
  | "completed"
  | "unsupported"
  | "error"
> = {
  parsing: "pending",
  translating: "translatingDocument",
  pausing: "cancelled",
  paused: "cancelled",
  partial_failed: "attention",
  completed: "completed",
  unsupported: "unsupported",
  failed: "error",
};
const EMPTY_CONTENT: DocumentContent = {
  markdown: "",
  complete: false,
  missing_parts: 0,
};
function documentStem(name: string) {
  return name.replace(/\.[^.]+$/, "") || "translation";
}

/** A continuous Markdown reader; fragment execution remains inside the Rust document module. */
export function DocsView() {
  const t = useT();
  const {
    documents,
    selectedId,
    loading,
    error,
    load,
    importBytes,
    remove,
    start,
    cancel,
    select,
    clearError,
  } = useDocumentStore();
  const [filter, setFilter] = useState<DocumentListFilter>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<DocumentView>("source");
  const [content, setContent] = useState<DocumentContent>(EMPTY_CONTENT);
  const [menu, setMenu] = useState<{
    kind: "file" | "reader";
    x: number;
    y: number;
    documentId?: string;
    selectedText?: string;
  } | null>(null);
  const reader = useRef<HTMLDivElement>(null);
  // Track the current failure cycle for each document. A retry clears this
  // entry while the snapshot is no longer failed, so the same persisted reason
  // is announced again if that retry later fails.
  const announcedFailures = useRef(new Map<string, string>());
  const radioRefs = useRef<Record<DocumentView, HTMLButtonElement | null>>({
    source: null,
    translation: null,
  });
  const scrollByView = useRef<Record<string, number>>({});
  const selected = documents.find((document) => document.id === selectedId);
  const visible = useMemo(
    () =>
      documents.filter(
        (item) =>
          matchesDocumentFilter(item.status, filter) &&
          item.file_name
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      ),
    [documents, filter, query],
  );
  // A document translation is only a reader result once it is complete. Older
  // persisted fragment jobs may still report partial data, but that execution
  // state must never leak source prose or missing-part markers into the reader.
  const translationFailed =
    selected?.status === "failed" || selected?.status === "partial_failed";
  const translatingTranslation =
    selected?.status === "translating" && view === "translation";
  const translationPlaceholder = translationFailed
    ? t("documentTranslationFailed")
    : selected?.status === "pausing" || selected?.status === "paused"
      ? t("cancelled")
      : selected?.status === "unsupported"
        ? t("unsupported")
        : view === "translation"
          ? t("translatingDocument")
          : t("selectDocument");
  const failureMessage = translationFailed
    ? (selected.error_message ?? t("documentFailureUnknown"))
    : null;
  // A translation result is safe to render only when the backend declares the
  // complete document available. While a job is active or has partially failed,
  // `documentContent` can still contain fragments that must remain hidden.
  const readerContent =
    view === "translation" && !content.complete ? EMPTY_CONTENT : content;
  const readerKey = `${selectedId ?? "none"}:${view}`;

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!selected?.id || !failureMessage) {
      if (selected?.id) announcedFailures.current.delete(selected.id);
      return;
    }
    if (announcedFailures.current.get(selected.id) === failureMessage) return;
    announcedFailures.current.set(selected.id, failureMessage);
    toast.error(failureMessage, { duration: 4000 });
  }, [failureMessage, selected?.id]);
  useEffect(() => {
    if (!selectedId) {
      setContent(EMPTY_CONTENT);
      return;
    }
    let cancelled = false;
    const priorKey = readerKey;
    scrollByView.current[priorKey] =
      reader.current?.scrollTop ?? scrollByView.current[priorKey] ?? 0;
    // Do not show a previous document/mode while this request is in flight.
    // The cancellation guard below handles late responses; clearing here also
    // prevents an observable stale-content flash before the next response.
    setContent(EMPTY_CONTENT);
    void documentContent(selectedId, view)
      .then((next) => {
        if (!cancelled) setContent(next);
      })
      .catch(
        (reason) =>
          !cancelled &&
          toast.error(t("readingFailed", { message: stringifyError(reason) }), {
            duration: 4000,
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [
    readerKey,
    selected?.translated_count,
    selected?.status,
    selectedId,
    t,
    view,
  ]);
  useLayoutEffect(() => {
    if (reader.current)
      reader.current.scrollTop = scrollByView.current[readerKey] ?? 0;
  }, [content.markdown, readerKey]);
  const importPath = async (path: string): Promise<boolean> => {
    let importStarted = false;
    try {
      const content = await readFile(path);
      importStarted = true;
      const started = await importBytes(
        path.split(/[\\/]/).pop() ?? "document",
        content,
      );
      if (started) setView("translation");
      return started;
    } catch (reason) {
      if (importStarted) clearError();
      toast.error(t("importFailed", { message: stringifyError(reason) }), {
        duration: 4000,
      });
      return false;
    }
  };
  const chooseDocument = async () => {
    const paths = await open({
      title: t("importDocument"),
      multiple: true,
      filters: DOCUMENT_FILTERS,
    });
    const selectedPaths = paths ? (Array.isArray(paths) ? paths : [paths]) : [];
    const results = await Promise.all(
      selectedPaths.map((path) => importPath(path)),
    );
    const imported = results.filter(Boolean).length;
    if (imported)
      toast.success(t("documentsImported", { count: String(imported) }));
  };
  const onDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    Array.from(event.dataTransfer.files).forEach((file) => {
      void (async () => {
        let importStarted = false;
        try {
          const buffer = await file.arrayBuffer();
          importStarted = true;
          const started = await importBytes(file.name, new Uint8Array(buffer));
          if (started) {
            setView("translation");
            toast.success(t("documentsImported", { count: "1" }));
          }
        } catch (reason) {
          if (importStarted) clearError();
          toast.error(t("importFailed", { message: stringifyError(reason) }), {
            duration: 4000,
          });
        }
      })();
    });
  };
  const copy = async () => {
    if (!content.markdown) return;
    try {
      await navigator.clipboard.writeText(content.markdown);
      toast.success(t("copied"));
    } catch (reason) {
      toast.error(t("copyFailed", { message: stringifyError(reason) }), {
        duration: 4000,
      });
    }
  };
  const exportCurrent = async () => {
    if (!selected || !content.markdown) return;
    if (view === "translation" && !content.complete) {
      toast.info(t("translatingDocument"));
      return;
    }
    const path = await save({
      title: t("exportDocument"),
      defaultPath: `${documentStem(selected.file_name)}.${view}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!path) return;
    try {
      await writeTextFile(path, content.markdown);
      toast.success(t("exportDone", { label: "Markdown" }));
    } catch (reason) {
      toast.error(t("exportFailed", { message: stringifyError(reason) }), {
        duration: 4000,
      });
    }
  };
  const deleteDocument = async (documentId = selectedId) => {
    const document = documents.find((item) => item.id === documentId);
    if (!document) return;
    try {
      const first = await confirm(
        t("deleteDocumentFirst", { name: document.file_name }),
        {
          title: t("deleteDocumentRecord"),
          kind: "warning",
          okLabel: t("continue"),
          cancelLabel: t("keep"),
        },
      );
      if (!first) return;
      const second = await confirm(t("deleteIrreversible"), {
        title: t("finalConfirmation"),
        kind: "warning",
        okLabel: t("permanentlyDelete"),
        cancelLabel: t("cancel"),
      });
      if (!second) return;
      await remove(document.id);
      toast.success(t("deletedDocument"));
    } catch (reason) {
      toast.error(t("actionFailed", { message: stringifyError(reason) }), {
        duration: 4000,
      });
    }
  };
  const copySelection = async (selectedText?: string) => {
    if (!selectedText) return;
    try {
      await navigator.clipboard.writeText(selectedText);
      toast.success(t("copied"));
    } catch (reason) {
      toast.error(t("copyFailed", { message: stringifyError(reason) }), {
        duration: 4000,
      });
    }
  };
  const selectReaderText = () => {
    if (!reader.current) return;
    const range = document.createRange();
    range.selectNodeContents(reader.current);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };
  const selectedReaderText = () => {
    const selection = window.getSelection();
    if (
      !selection ||
      (!reader.current?.contains(selection.anchorNode) &&
        !reader.current?.contains(selection.focusNode))
    )
      return "";
    return selection.toString().trim();
  };
  const setDocumentView = (next: DocumentView) => setView(next);
  const selectDocument = (documentId: string) => {
    const document = documents.find((item) => item.id === documentId);
    select(documentId);
    setView(document?.status === "completed" ? "translation" : "source");
  };
  const onDocumentViewKeyDown = (event: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "ArrowLeft" || event.key === "Home"
        ? "source"
        : "translation";
    setDocumentView(next);
    radioRefs.current[next]?.focus();
  };
  const menuItems: ContextMenuItem[] =
    menu?.kind === "file"
      ? [
          { label: t("source"), onSelect: () => setView("source") },
          { label: t("translation"), onSelect: () => setView("translation") },
          {
            label: t("deleteDocumentRecord"),
            destructive: true,
            onSelect: () => void deleteDocument(menu.documentId),
          },
        ]
      : [
          {
            label: t("copySelection"),
            onSelect: () => void copySelection(menu?.selectedText),
            disabled: !menu?.selectedText,
          },
          {
            label:
              view === "translation"
                ? t("copyTranslation")
                : t("copySourceDocument"),
            onSelect: () => void copy(),
          },
          { label: t("selectAll"), onSelect: selectReaderText },
        ];
  const action = async (operation: "start" | "cancel") => {
    if (!selected) return;
    try {
      const started = await { start, cancel }[operation](selected.id);
      if (operation === "start" && started)
        toast.info(t("translatingDocument"));
      if (operation === "cancel") toast.success(t("cancelled"));
    } catch (reason) {
      toast.error(t("actionFailed", { message: stringifyError(reason) }), {
        duration: 4000,
      });
    }
  };
  return (
    <ViewShell
      toolbar={
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            role="radiogroup"
            aria-label={t("documentView")}
            className="flex shrink-0 rounded-sm border border-border p-0.5"
            onKeyDown={onDocumentViewKeyDown}
          >
            <button
              type="button"
              role="radio"
              aria-checked={view === "source"}
              tabIndex={view === "source" ? 0 : -1}
              ref={(node) => {
                radioRefs.current.source = node;
              }}
              onClick={() => setDocumentView("source")}
              className={cn(
                "rounded-sm px-2 py-1 text-xs",
                view === "source"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {t("source")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view === "translation"}
              tabIndex={view === "translation" ? 0 : -1}
              ref={(node) => {
                radioRefs.current.translation = node;
              }}
              onClick={() => setDocumentView("translation")}
              className={cn(
                "rounded-sm px-2 py-1 text-xs",
                view === "translation"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {t("translation")}
            </button>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void chooseDocument()}
          >
            <Upload className="h-3.5 w-3.5" />
            {t("importDocument")}
          </Button>
          <span className="ml-auto flex shrink-0 gap-1">
            {selected &&
            ["pausing", "paused", "partial_failed", "failed"].includes(
              selected.status,
            ) ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void action("start")}
              >
                <Play className="h-3.5 w-3.5" />
                {t("retry")}
              </Button>
            ) : null}
            {selected?.status === "completed" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void action("start")}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("retranslate")}
              </Button>
            ) : null}
            {selected?.status === "translating" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void action("cancel")}
              >
                <X className="h-3.5 w-3.5" />
                {t("cancel")}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                view === "translation"
                  ? t("copyTranslation")
                  : t("copySourceDocument")
              }
              onClick={() => void copy()}
              disabled={!content.markdown}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("exportDocument")}
              onClick={() => void exportCurrent()}
              disabled={!selected || !content.markdown}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("deleteDocumentRecord")}
              onClick={() => void deleteDocument()}
              disabled={!selectedId}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>
      }
    >
      <div className="grid h-full grid-cols-[220px_minmax(0,1fr)] divide-x divide-border">
        <aside className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-border p-2">
            <input
              aria-label={t("searchDocuments")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchDocuments")}
              className="h-8 w-full rounded-sm border border-input bg-transparent px-2 text-xs"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    "rounded-sm px-1.5 py-1 text-[10px]",
                    filter === item.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {t(item.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectDocument(item.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  select(item.id);
                  setMenu({
                    kind: "file",
                    x: event.clientX,
                    y: event.clientY,
                    documentId: item.id,
                  });
                }}
                aria-current={item.id === selectedId ? "page" : undefined}
                aria-label={`${item.file_name}: ${t(statusKey[item.status])}`}
                className={cn(
                  "mb-1 w-full rounded-sm px-2.5 py-2 text-left",
                  item.id === selectedId ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <div className="flex items-center gap-2">
                  {item.status === "parsing" ||
                  item.status === "translating" ? (
                    <LoaderCircle
                      data-testid="document-spinner"
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 animate-spin text-info motion-reduce:animate-none"
                    />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-info" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.file_name}
                  </span>
                </div>
              </button>
            ))}
            {visible.length === 0 && !loading ? (
              <p className="p-3 text-xs text-muted-foreground">
                {t("noDocuments")}
              </p>
            ) : null}
          </div>
        </aside>
        <section
          className="flex min-h-0 flex-col overflow-hidden"
          aria-busy={translatingTranslation}
        >
          <div
            ref={reader}
            onScroll={(event) => {
              scrollByView.current[readerKey] = event.currentTarget.scrollTop;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({
                kind: "reader",
                x: event.clientX,
                y: event.clientY,
                selectedText: selectedReaderText(),
              });
            }}
            className="relative min-h-0 flex-1 overflow-auto p-5"
          >
            {!translatingTranslation ? (
              <MarkdownDocument
                markdown={readerContent.markdown}
                placeholder={translationPlaceholder}
              />
            ) : null}
            {translatingTranslation ? (
              <div
                role="status"
                aria-live="polite"
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/95 text-sm text-info"
              >
                <LoaderCircle
                  aria-hidden="true"
                  className="h-5 w-5 animate-spin motion-reduce:animate-none"
                />
                <span>{t("translatingDocument")}</span>
              </div>
            ) : null}
          </div>
          {error || selected?.status === "unsupported" ? (
            <p
              role="alert"
              className="shrink-0 border-t border-border px-5 py-2 text-sm text-destructive"
            >
              {selected?.status === "unsupported"
                ? t("unsupported")
                : error}
            </p>
          ) : null}
        </section>
      </div>
      <ContextMenu
        open={menu !== null}
        position={menu ?? { x: 0, y: 0 }}
        items={menuItems}
        ariaLabel={
          menu?.kind === "file" ? t("fileActions") : t("readerActions")
        }
        onClose={() => setMenu(null)}
      />
    </ViewShell>
  );
}

function MarkdownDocument({
  markdown,
  placeholder,
}: {
  markdown: string;
  placeholder: string;
}) {
  if (!markdown)
    return <p className="text-sm text-muted-foreground">{placeholder}</p>;
  return (
    <article className="max-w-none text-[13px] leading-7 text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-4 mt-7 text-2xl font-semibold leading-tight first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-6 text-xl font-semibold leading-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-5 text-lg font-semibold leading-tight">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="my-3 first:mt-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-info pl-4 text-muted-foreground">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-accent px-3 py-2 font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-2 align-top">
              {children}
            </td>
          ),
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-md bg-accent p-3 font-mono text-xs leading-6">
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code className="rounded bg-accent px-1 font-mono text-[0.92em]">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              className="text-info underline underline-offset-2"
              href={safeHref(href)}
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
function safeHref(href?: string) {
  return href && /^(https?:|mailto:)/i.test(href) ? href : "#";
}
