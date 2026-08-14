import { useState } from "react";
import { Copy, Download, FileText, Trash2, Upload } from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface DstPara {
  text: string;
  /** 保留词（不予翻译的开发术语，info 高亮）。 */
  keep?: boolean;
  /** 保留词后的正文（仅 keep 段使用）。 */
  tail?: string;
}

interface DocItem {
  id: string;
  name: string;
  meta: string;
  src: string[];
  dst: DstPara[];
}

const DOCS: DocItem[] = [
  {
    id: "go",
    name: "go-concurrency.md",
    meta: "412 字 · 3 段",
    src: [
      "Concurrency is the composition of independently executing processes.",
      "Goroutines are lightweight threads managed by the Go runtime, not by the operating system.",
      "Channels let goroutines communicate by passing values, so only one goroutine owns a value at a time.",
    ],
    dst: [
      { text: "并发是多个独立执行过程的组合。" },
      {
        text: "goroutine",
        keep: true,
        tail: " 是由 Go 运行时（而非操作系统）管理的轻量级线程。",
      },
      {
        text: "channel",
        keep: true,
        tail: " 让 goroutine 通过传递值来通信，使同一时刻仅有一个 goroutine 持有该值。",
      },
    ],
  },
  {
    id: "rpc",
    name: "rpc-errors.md",
    meta: "1.2k 字 · 8 段",
    src: [],
    dst: [],
  },
  {
    id: "http",
    name: "http-status-codes.md",
    meta: "860 字 · 5 段",
    src: [],
    dst: [],
  },
  {
    id: "api",
    name: "api-design-guide.md",
    meta: "3.4k 字 · 18 段",
    src: [],
    dst: [],
  },
];

/**
 * 文档视图（§3 场景 4，对齐原型文档 panel）：
 * 顶部操作行（上传 + 原文 / 译文切换）+ 左栏文件历史 + 右栏预览（含保留词高亮）。
 * 全页只有主面板一层容器，左右两栏靠竖向分割线分隔，不各自套卡片。
 * 文档翻译为 P1 / V1.5 特性，此处用静态示例还原布局，业务能力留待后续。
 */
export function DocsView() {
  const t = useT();
  const [activeDoc, setActiveDoc] = useState("go");
  const [vtab, setVtab] = useState<"src" | "dst">("src");
  const doc = DOCS.find((d) => d.id === activeDoc) ?? DOCS[0];
  const hasContent = doc.src.length > 0;

  return (
    <ViewShell
      toolbar={
        <>
          <Button size="sm" title={t("uploadFile")}>
            <Upload className="h-3.5 w-3.5" />
            {t("uploadFile")}
          </Button>
          <div className="flex gap-0.5 rounded-sm border border-border bg-muted/30 p-0.5">
            {(["src", "dst"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setVtab(tab)}
                aria-pressed={vtab === tab}
                className={cn(
                  "rounded-[5px] px-3 py-1 text-xs font-medium transition-colors duration-fast",
                  vtab === tab
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab === "src" ? t("documentSource") : t("documentTranslation")}
              </button>
            ))}
          </div>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {doc.name}
          </span>
          <div className="ml-auto flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              title={t("copy")}
              aria-label={t("copy")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={t("export")}
              aria-label={t("export")}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={t("delete")}
              aria-label={t("delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      }
    >
      {/* 文件列表与预览靠一条竖向分割线分隔，不各自成卡片 */}
      <div className="grid h-full grid-cols-[220px_1fr] divide-x divide-border">
        {/* 文件历史 */}
        <aside className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {t("fileHistory")}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-2">
            {DOCS.map((d) => {
              const active = d.id === activeDoc;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setActiveDoc(d.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-sm border px-2.5 py-2 text-left transition-colors duration-fast",
                    active
                      ? "border-foreground/12 bg-accent"
                      : "border-transparent hover:bg-accent/60",
                  )}
                >
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-border text-info">
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span
                      className={cn(
                        "truncate text-sm font-medium",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {d.name}
                    </span>
                    <span className="mt-px font-mono text-[10px] text-muted-foreground">
                      {d.meta}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* 查看器 */}
        <section className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-auto px-5 py-4">
            {hasContent ? (
              vtab === "src" ? (
                doc.src.map((p, i) => (
                  <p
                    key={i}
                    className="mb-3 text-[13px] leading-7 text-muted-foreground last:mb-0"
                  >
                    {p}
                  </p>
                ))
              ) : (
                doc.dst.map((p, i) => (
                  <p
                    key={i}
                    className="mb-3 text-[13px] leading-7 text-foreground last:mb-0"
                  >
                    {p.keep ? (
                      <>
                        <span className="rounded bg-info/10 px-[5px] py-px font-mono text-xs text-info">
                          {p.text}
                        </span>
                        {p.tail}
                      </>
                    ) : (
                      p.text
                    )}
                  </p>
                ))
              )
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                该文档的解析与翻译将在 V1.5 实装
              </div>
            )}
          </div>
        </section>
      </div>
    </ViewShell>
  );
}
