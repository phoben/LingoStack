import { type ReactNode, useState } from "react";
import { Bookmark, Copy, RotateCcw, Sparkles, Volume2 } from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { chatStream, effectivePrompt, speak } from "@/lib/ipc";
import { useConfigStore } from "@/stores/config-store";
import { useFavoritesStore } from "@/stores/favorites-store";
import { cn } from "@/lib/utils";

/** 默认示例原文（开发者语境，便于首次体验）。 */
const SOURCE_TEXT =
  "The graceful shutdown handler waits for in-flight requests to complete before terminating the process, with a configurable timeout to force-exit if they hang.";

const LANG_NAME: Record<string, string> = {
  auto: "自动检测",
  zh: "中文",
  en: "English",
  ja: "日本語",
};

type Status = "idle" | "streaming" | "done" | "error";

/** 面板标签栏（原型 .pane-label）。 */
function PaneLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3.5 py-2 font-mono text-xs text-muted-foreground">
      {children}
    </div>
  );
}

/** 面板底栏（原型 .pane-foot）。 */
function PaneFoot({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-t border-border bg-background/40 px-3 py-2">
      {children}
    </div>
  );
}

const STATUS_STYLE: Record<Status, { dot: string; text: string; cls: string }> = {
  idle: { dot: "bg-muted-foreground/40", text: "待翻译", cls: "text-muted-foreground" },
  streaming: { dot: "animate-pulse bg-info", text: "流式", cls: "text-info" },
  done: { dot: "bg-success", text: "已完成", cls: "text-success" },
  error: { dot: "bg-accent", text: "错误", cls: "text-accent" },
};

/** 状态点 + 文案（译文面板右上）。 */
function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[10px]", s.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.text}
    </span>
  );
}

/**
 * 翻译视图（§3 场景 2，对齐原型翻译 panel）：
 * 双 pane（原文 / 译文）+ 语言对 + 真实流式 SSE。
 *
 * 经 `effective_prompt` 取内置 Prompt（替换 {source_lang}/{target_lang} 占位符），
 * 再以 `chat_stream` 发起流式聊天，增量经 Channel 回填译文面板。
 * 流式中断时保留已渲染部分并提供「重试」（§9）。
 * 当前模型由 config 解析（功能默认 → 全局默认）。
 */
export function TranslateView() {
  const config = useConfigStore((s) => s.config);
  const addFavorite = useFavoritesStore((s) => s.add);
  const [saved, setSaved] = useState(false);
  const [source, setSource] = useState(SOURCE_TEXT);
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("zh");

  // 当前翻译所用模型（功能默认 → 全局默认 → 未配置）。
  const modelLabel = (() => {
    const ref = config?.models.translate ?? config?.models.global_default;
    if (!ref) return "未配置模型";
    const provider = config?.providers.find((p) => p.id === ref.provider_id);
    return provider ? `${provider.name} · ${ref.model}` : ref.model;
  })();

  const translate = async () => {
    if (!source.trim() || status === "streaming") return;
    setStatus("streaming");
    setTarget("");
    setErrorMsg(null);
    try {
      const tpl = await effectivePrompt("translate");
      const system = tpl
        .replace(/\{source_lang\}/g, LANG_NAME[sourceLang] ?? "自动检测")
        .replace(/\{target_lang\}/g, LANG_NAME[targetLang] ?? "中文");
      await chatStream(
        "translate",
        [
          { role: "system", content: system },
          { role: "user", content: source },
        ],
        (event) => {
          if (event.type === "chunk") {
            setTarget((prev) => prev + event.delta);
          } else if (event.type === "done") {
            setStatus("done");
          } else if (event.type === "error") {
            setStatus("error");
            setErrorMsg(event.message);
          }
        },
      );
    } catch (e) {
      setStatus("error");
      setErrorMsg(typeof e === "string" ? e : String(e));
    }
  };

  const copy = () => {
    if (target) {
      void navigator.clipboard.writeText(target);
    }
  };

  // 收藏「原文 → 译文」，来源标记为翻译。
  const favorite = async () => {
    if (!source.trim() || !target.trim()) return;
    await addFavorite(source, target, "翻译");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <ViewShell view="translate">
      <div className="grid h-full grid-cols-2 gap-3.5">
        {/* 原文 */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
          <PaneLabel>
            <span>原文</span>
            <span className="flex-1" aria-hidden="true" />
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
          </PaneLabel>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="输入或粘贴要翻译的文本"
            className="min-h-0 flex-1 resize-none bg-transparent px-3.5 py-3.5 text-sm leading-7 text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <PaneFoot>
            <span className="font-mono text-[10px] text-muted-foreground">
              {source.length} 字符
            </span>
            <Button size="sm" onClick={translate} disabled={status === "streaming"}>
              <Sparkles className="h-3.5 w-3.5" />
              {status === "streaming" ? "翻译中…" : "翻译"}
            </Button>
          </PaneFoot>
        </section>

        {/* 译文 */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
          <PaneLabel>
            <span>译文</span>
            <span className="flex-1" aria-hidden="true" />
            <StatusBadge status={status} />
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
          </PaneLabel>
          <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-3.5 py-3.5 text-sm leading-7 text-foreground">
            {target}
            {status === "streaming" ? (
              <span className="ml-px inline-block h-[1.05em] w-0.5 animate-pulse bg-info align-middle" />
            ) : null}
            {status === "error" ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-accent">{errorMsg}</span>
                <Button variant="ghost" size="sm" onClick={translate}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  重试
                </Button>
              </div>
            ) : null}
          </div>
          <PaneFoot>
            <span className="font-mono text-[10px] text-muted-foreground">
              {modelLabel}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                title="朗读译文"
                aria-label="朗读译文"
                onClick={() => void speak(target)}
                disabled={!target || status === "streaming"}
              >
                <Volume2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={saved ? "已收藏" : "收藏译文"}
                aria-label="收藏译文"
                onClick={() => void favorite()}
                disabled={!target || status === "streaming"}
              >
                <Bookmark
                  className={cn("h-3.5 w-3.5", saved && "text-success")}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="复制译文"
                aria-label="复制译文"
                onClick={copy}
                disabled={!target}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </PaneFoot>
        </section>
      </div>
    </ViewShell>
  );
}
