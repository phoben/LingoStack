import { useState } from "react";
import { Check, Copy, RotateCcw, Sparkles } from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { chatStream, effectivePrompt } from "@/lib/ipc";
import { NAMING_STYLE_LABEL, type NamingStyle } from "@/lib/config-types";
import { parseCandidates } from "@/lib/naming";
import { useConfigStore } from "@/stores/config-store";
import { cn } from "@/lib/utils";

const STYLES: NamingStyle[] = [
  "camel_case",
  "snake_case",
  "pascal_case",
  "kebab_case",
  "constant_case",
];

type Status = "idle" | "streaming" | "done" | "error";

/**
 * 命名视图（§3 场景 3，对齐原型命名 panel）：
 * 中文描述 + 命名规范切换 + LLM 生成候选。
 *
 * 经 `effective_prompt("naming")` 取内置 Prompt（替换 {style} 占位符），
 * 再以 `chat_stream` 流式获取候选，累积后按行解析（见 parseCandidates）。
 * 切换规范不会自动重算——需显式点「生成」，避免误触发多次 LLM 调用。
 */
export function NamingView() {
  const config = useConfigStore((s) => s.config);
  const [desc, setDesc] = useState("获取用户资料");
  const [style, setStyle] = useState<NamingStyle>("camel_case");
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const modelLabel = (() => {
    const ref = config?.models.naming ?? config?.models.global_default;
    if (!ref) return "未配置模型";
    const provider = config?.providers.find((p) => p.id === ref.provider_id);
    return provider ? `${provider.name} · ${ref.model}` : ref.model;
  })();

  const candidates = parseCandidates(raw);

  const generate = async () => {
    if (!desc.trim() || status === "streaming") return;
    setStatus("streaming");
    setRaw("");
    setErrorMsg(null);
    try {
      const tpl = await effectivePrompt("naming");
      const system = tpl.replace(/\{style\}/g, NAMING_STYLE_LABEL[style]);
      await chatStream(
        "naming",
        [
          { role: "system", content: system },
          { role: "user", content: desc },
        ],
        (event) => {
          if (event.type === "chunk") {
            setRaw((prev) => prev + event.delta);
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

  const copy = (name: string) => {
    void navigator.clipboard.writeText(name);
    setCopied(name);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <ViewShell view="naming">
      <div className="mx-auto flex h-full max-w-2xl flex-col">
        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium tracking-wide text-muted-foreground"
              htmlFor="nm-desc"
            >
              中文描述
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="nm-desc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void generate();
                }}
                aria-label="变量用途描述"
                className="max-w-[420px]"
              />
              <Button
                size="md"
                onClick={generate}
                disabled={status === "streaming" || !desc.trim()}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {status === "streaming" ? "生成中…" : "生成"}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {STYLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStyle(s)}
                aria-pressed={style === s}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 font-mono text-xs transition-colors duration-fast ease-app",
                  style === s
                    ? "border-transparent bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                )}
              >
                {NAMING_STYLE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
          {status === "idle" && candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
              输入用途描述并点「生成」，按所选规范产出候选标识符。
            </p>
          ) : null}

          {candidates.map((name) => (
            <div
              key={name}
              className="flex items-center rounded-lg border border-border bg-background px-4 py-3 transition-colors duration-fast hover:border-foreground/15"
            >
              <span className="font-mono text-[15px] font-medium text-foreground">
                {name}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => copy(name)}
                aria-label={`复制 ${name}`}
              >
                {copied === name ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied === name ? "已复制" : "复制"}
              </Button>
            </div>
          ))}

          {status === "streaming" ? (
            <span className="inline-block h-[1.05em] w-0.5 animate-pulse bg-info align-middle" />
          ) : null}

          {status === "error" ? (
            <div className="flex items-center gap-2 rounded-lg border border-accent/30 px-4 py-3">
              <span className="text-xs text-accent">{errorMsg}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={generate}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重试
              </Button>
            </div>
          ) : null}
        </div>

        <p className="mt-2 shrink-0 font-mono text-[10px] text-muted-foreground">
          {modelLabel}
        </p>
      </div>
    </ViewShell>
  );
}
