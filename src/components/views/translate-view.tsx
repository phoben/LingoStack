import { type ReactNode, useEffect, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  Copy,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { effectiveTranslationPrompt, translationPlan } from "@/lib/ipc";
import type { TranslationTerm } from "@/lib/translation-envelope";
import { useAppStore } from "@/stores/app-store";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useTtsStore } from "@/stores/tts-store";
import { useConfigStore } from "@/stores/config-store";
import { resolveLocale } from "@/lib/i18n";
import { useT } from "@/lib/i18n";
import { type StreamStatus, useStreamStore } from "@/stores/stream-store";
import { cn } from "@/lib/utils";

export function TermTags({ terms }: { terms: TranslationTerm[] }) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  if (terms.length === 0) return null;
  return (
    <section
      className="mt-4 border-t border-border pt-3"
      aria-label={t("contextualTerms")}
    >
      <p className="mb-2 text-xs text-muted-foreground">
        {t("contextualTerms")}
      </p>
      <div className="flex flex-wrap gap-2">
        {terms.map((term, index) => {
          const id = `term-explanation-${index}`;
          return (
            <span key={`${term.category}:${term.term}`} className="relative">
              <button
                type="button"
                className="rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors duration-fast hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-info/40"
                aria-describedby={open === index ? id : undefined}
                onMouseEnter={() => setOpen(index)}
                onMouseLeave={() => setOpen(null)}
                onFocus={() => setOpen(index)}
                onBlur={() => setOpen(null)}
              >
                {term.term}
              </button>
              {open === index ? (
                <span
                  id={id}
                  role="tooltip"
                  className="absolute left-0 top-full z-10 mt-1 w-56 border border-border bg-surface px-2 py-1.5 text-xs text-foreground shadow-ring"
                >
                  {term.explanation}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </section>
  );
}

/** 面板标签栏（原型 .pane-label）：与正文之间只隔一条浅色线。 */
function PaneLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">
      {children}
    </div>
  );
}

const STATUS_STYLE: Record<
  StreamStatus,
  { dot: string; text: string; cls: string }
> = {
  idle: {
    dot: "bg-muted-foreground/40",
    text: "待翻译",
    cls: "text-muted-foreground",
  },
  streaming: { dot: "animate-pulse bg-info", text: "流式", cls: "text-info" },
  done: { dot: "bg-success", text: "已完成", cls: "text-success" },
  error: { dot: "bg-accent", text: "错误", cls: "text-accent" },
};

/** 状态点 + 文案（工具条内，兼作流式进度指示）。 */
function StatusBadge({ status }: { status: StreamStatus }) {
  const t = useT();
  const s = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[10px]",
        s.cls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {t(
        status === "idle"
          ? "pending"
          : status === "streaming"
            ? "streaming"
            : status === "done"
              ? "completed"
              : "error",
      )}
    </span>
  );
}

interface PaneActionsProps {
  /** 朗读与复制的目标文本。 */
  text: string;
  /** 收藏动作；不可用时传 null。 */
  onFavorite: (() => void) | null;
  favorited: boolean;
  /** 面板身份，用于区分无障碍标签（原文 / 译文）。 */
  label: string;
  streaming: boolean;
}

/** 面板动作组：朗读 / 收藏 / 复制。原文与译文共用同一组形状。 */
function PaneActions({
  text,
  onFavorite,
  favorited,
  label,
  streaming,
}: PaneActionsProps) {
  const t = useT();
  const ttsStatus = useTtsStore((s) => s.status);
  const speakingText = useTtsStore((s) => s.text);
  const speakText = useTtsStore((s) => s.speakText);
  const stop = useTtsStore((s) => s.stop);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={
          ttsStatus === "speaking" && speakingText === text
            ? t("stopSpeaking")
            : `${t("speak")} ${label}`
        }
        aria-label={
          ttsStatus === "speaking" && speakingText === text
            ? t("stopSpeaking")
            : `${t("speak")} ${label}`
        }
        onClick={() =>
          void (ttsStatus === "speaking" && speakingText === text
            ? stop()
            : speakText(text))
        }
        // 朗读期间即使翻译还在流式输出，也必须允许用户随时停止。
        disabled={
          !text ||
          (streaming && !(ttsStatus === "speaking" && speakingText === text))
        }
      >
        {ttsStatus === "speaking" && speakingText === text ? (
          <Square className="h-3.5 w-3.5" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={favorited ? t("favorited") : t("favorite")}
        aria-label={t("favorite")}
        onClick={() => onFavorite?.()}
        disabled={!onFavorite || streaming}
      >
        <Bookmark className={cn("h-3.5 w-3.5", favorited && "text-success")} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={copied ? t("copied") : `${t("copy")} ${label}`}
        aria-label={`${t("copy")} ${label}`}
        onClick={copy}
        disabled={!text}
      >
        <Copy className={cn("h-3.5 w-3.5", copied && "text-success")} />
      </Button>
    </div>
  );
}

/**
 * 翻译视图（§3 场景 2，对齐原型翻译 panel）：
 * 顶部操作行（语言对 + 状态 + 翻译按钮）+ 双 pane（原文 / 译文）。
 *
 * 全页只有主面板一层容器，内部靠浅色分割线分区：操作行与内容区隔一条横线，
 * 原文与译文之间隔一条竖线，两侧文本区直接坐在面板底色上，不再各自套卡片。
 *
 * 两个面板结构完全对称：标题栏（名称 + 朗读/收藏/复制）+ 内容区，无底栏。
 * 动作按钮位置左右一致，避免同一组操作在两侧高度不同造成的视觉割裂。
 *
 * 经 `effective_prompt` 取内置 Prompt（替换 {source_lang}/{target_lang} 占位符），
 * 再由 stream-store 发起流式聊天。任务态存在 store 而非组件内：切到别的页面
 * 再回来，进行中的翻译不中断、已产出的译文不丢失。
 * 流式进度由工具条的状态标记表达，译文区不做闪烁光标。
 * 流式中断时保留已渲染部分并提供「重试」（§9）。
 */
export function TranslateView() {
  const addFavorite = useFavoritesStore((s) => s.add);
  const injectSource = useAppStore((s) => s.injectSource);
  const setInjectSource = useAppStore((s) => s.setInjectSource);
  const selectionFeedback = useAppStore((s) => s.selectionFeedback);
  const setSelectionFeedback = useAppStore((s) => s.setSelectionFeedback);
  const ttsError = useTtsStore((s) => s.error);
  const clearTtsError = useTtsStore((s) => s.clearError);
  const task = useStreamStore((s) => s.tasks.translate);
  const setInput = useStreamStore((s) => s.setInput);
  const start = useStreamStore((s) => s.start);
  const uiLanguage = useConfigStore((s) => s.config?.ui_language ?? "system");
  const t = useT();
  const [saved, setSaved] = useState(false);
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("auto");

  const streaming = task.status === "streaming";
  const source = task.input;
  const target = task.output;

  const translate = (override?: string) => {
    const src = override ?? source;
    void start("translate", src, async () => {
      const plan = await translationPlan(
        src,
        sourceLang === "auto" ? undefined : (sourceLang as "zh" | "en" | "ja"),
        targetLang === "auto" ? undefined : (targetLang as "zh" | "en" | "ja"),
        resolveLocale(uiLanguage) === "zh" ? "zh" : "en",
      );
      const system = await effectiveTranslationPrompt(plan.source, plan.target);
      return [
        { role: "system", content: system },
        { role: "user", content: src },
      ];
    });
  };

  // 划词热键注入的原文：消费后立即翻译（覆盖当前输入框内容）。
  useEffect(() => {
    if (injectSource != null) {
      setInjectSource(null);
      translate(injectSource);
    }
    // translate 与 setInjectSource 为稳定引用；仅 injectSource 变化时触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectSource]);

  // 收藏「原文 → 译文」，来源标记为翻译。
  const favorite = async () => {
    if (!source.trim() || !target.trim()) return;
    await addFavorite(source, target, "翻译");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const canFavorite = source.trim().length > 0 && target.trim().length > 0;
  const favoriteAction = canFavorite ? () => void favorite() : null;

  return (
    <ViewShell
      toolbar={
        <>
          <Select
            aria-label={t("sourceLanguage")}
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            className="h-8 w-[124px] text-xs"
          >
            <option value="auto">{t("autoDetect")}</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="ja">日本語</option>
          </Select>
          <ArrowRight
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <Select
            aria-label={t("targetLanguage")}
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="h-8 w-[110px] text-xs"
          >
            <option value="auto">{t("byLanguageRule")}</option>
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </Select>
          <StatusBadge status={task.status} />
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => translate()}
            disabled={streaming || !source.trim()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {streaming ? t("translating") : t("translateAction")}
          </Button>
        </>
      }
    >
      {selectionFeedback ? (
        <div
          className="border-b border-border px-4 py-2 text-xs"
          aria-live={
            selectionFeedback.kind === "clipboard" ? "polite" : undefined
          }
          role={selectionFeedback.kind === "error" ? "alert" : undefined}
        >
          <span
            className={
              selectionFeedback.kind === "clipboard"
                ? "text-info"
                : "text-accent"
            }
          >
            {selectionFeedback.kind === "clipboard"
              ? t("selectionClipboardFallback")
              : selectionFeedback.message}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 h-6"
            onClick={() => setSelectionFeedback(null)}
          >
            {t("dismiss")}
          </Button>
        </div>
      ) : null}
      {ttsError ? (
        <div
          role="alert"
          className="border-b border-border px-4 py-2 text-xs text-accent"
        >
          {t("speakFailed", { message: ttsError })}
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 h-6"
            onClick={clearTtsError}
          >
            {t("dismiss")}
          </Button>
        </div>
      ) : null}
      {/* 原文 / 译文靠一条竖向分割线分隔，不各自成卡片 */}
      <div className="grid h-full grid-cols-2 divide-x divide-border">
        {/* 原文 */}
        <section className="flex min-h-0 flex-col overflow-hidden">
          <PaneLabel>
            <span>{t("sourceText")}</span>
            <span className="flex-1" aria-hidden="true" />
            <PaneActions
              text={source}
              onFavorite={favoriteAction}
              favorited={saved}
              label={t("source")}
              streaming={streaming}
            />
          </PaneLabel>
          <textarea
            value={source}
            onChange={(e) => setInput("translate", e.target.value)}
            placeholder={t("inputToTranslate")}
            className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3.5 text-sm leading-7 text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </section>

        {/* 译文 */}
        <section className="flex min-h-0 flex-col overflow-hidden">
          <PaneLabel>
            <span>{t("translatedText")}</span>
            <span className="flex-1" aria-hidden="true" />
            <PaneActions
              text={target}
              onFavorite={favoriteAction}
              favorited={saved}
              label={t("translation")}
              streaming={streaming}
            />
          </PaneLabel>
          <div
            aria-live="polite"
            aria-busy={streaming}
            className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3.5 text-sm leading-7 text-foreground"
          >
            {target}
            <TermTags terms={task.terms} />
            {task.diagnostic ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {task.diagnostic}
              </p>
            ) : null}
            {task.status === "error" ? (
              <div role="alert" className="mt-2 flex items-center gap-2">
                <span className="text-xs text-accent">{task.error}</span>
                <Button variant="ghost" size="sm" onClick={() => translate()}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("retry")}
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </ViewShell>
  );
}
