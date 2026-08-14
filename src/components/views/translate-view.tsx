import { type ReactNode, useEffect, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  Copy,
  RotateCcw,
  Sparkles,
  Volume2,
} from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { effectivePrompt, speak } from "@/lib/ipc";
import { useAppStore } from "@/stores/app-store";
import { useFavoritesStore } from "@/stores/favorites-store";
import { type StreamStatus, useStreamStore } from "@/stores/stream-store";
import { cn } from "@/lib/utils";

const LANG_NAME: Record<string, string> = {
  auto: "自动检测",
  zh: "中文",
  en: "English",
  ja: "日本語",
};

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
  const s = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[10px]",
        s.cls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.text}
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
        title={`朗读${label}`}
        aria-label={`朗读${label}`}
        onClick={() => void speak(text)}
        disabled={!text || streaming}
      >
        <Volume2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={favorited ? "已收藏" : "收藏"}
        aria-label="收藏"
        onClick={() => onFavorite?.()}
        disabled={!onFavorite || streaming}
      >
        <Bookmark className={cn("h-3.5 w-3.5", favorited && "text-success")} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={copied ? "已复制" : `复制${label}`}
        aria-label={`复制${label}`}
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
  const task = useStreamStore((s) => s.tasks.translate);
  const setInput = useStreamStore((s) => s.setInput);
  const start = useStreamStore((s) => s.start);
  const [saved, setSaved] = useState(false);
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("zh");

  const streaming = task.status === "streaming";
  const source = task.input;
  const target = task.output;

  const translate = (override?: string) => {
    const src = override ?? source;
    void start("translate", src, async () => {
      const tpl = await effectivePrompt("translate");
      const system = tpl
        .replace(/\{source_lang\}/g, LANG_NAME[sourceLang] ?? "自动检测")
        .replace(/\{target_lang\}/g, LANG_NAME[targetLang] ?? "中文");
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
            aria-label="源语言"
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            className="h-8 w-[124px] text-xs"
          >
            <option value="auto">自动检测</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="ja">日本語</option>
          </Select>
          <ArrowRight
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <Select
            aria-label="目标语言"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="h-8 w-[110px] text-xs"
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </Select>
          <StatusBadge status={task.status} />
          <Button
            size="sm"
            className="ml-auto"
            aria-label="执行翻译"
            onClick={() => translate()}
            disabled={streaming || !source.trim()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {streaming ? "翻译中…" : "翻译"}
          </Button>
        </>
      }
    >
      {/* 原文 / 译文靠一条竖向分割线分隔，不各自成卡片 */}
      <div className="grid h-full grid-cols-2 divide-x divide-border">
        {/* 原文 */}
        <section className="flex min-h-0 flex-col overflow-hidden">
          <PaneLabel>
            <span>原文</span>
            <span className="flex-1" aria-hidden="true" />
            <PaneActions
              text={source}
              onFavorite={favoriteAction}
              favorited={saved}
              label="原文"
              streaming={streaming}
            />
          </PaneLabel>
          <textarea
            value={source}
            onChange={(e) => setInput("translate", e.target.value)}
            placeholder="输入或粘贴要翻译的文本"
            className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3.5 text-sm leading-7 text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </section>

        {/* 译文 */}
        <section className="flex min-h-0 flex-col overflow-hidden">
          <PaneLabel>
            <span>译文</span>
            <span className="flex-1" aria-hidden="true" />
            <PaneActions
              text={target}
              onFavorite={favoriteAction}
              favorited={saved}
              label="译文"
              streaming={streaming}
            />
          </PaneLabel>
          <div
            aria-live="polite"
            aria-busy={streaming}
            className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3.5 text-sm leading-7 text-foreground"
          >
            {target}
            {task.status === "error" ? (
              <div role="alert" className="mt-2 flex items-center gap-2">
                <span className="text-xs text-accent">{task.error}</span>
                <Button variant="ghost" size="sm" onClick={() => translate()}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  重试
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </ViewShell>
  );
}
