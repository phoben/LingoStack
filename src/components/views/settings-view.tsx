import { type ReactNode, useState } from "react";
import { Info, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/ui/pill";
import { useThemeStore, type ThemeMode } from "@/stores/theme-store";
import { cn } from "@/lib/utils";

type Sub = "general" | "shortcuts" | "ai" | "appearance";

const SUBTABS: { id: Sub; label: string }[] = [
  { id: "general", label: "通用" },
  { id: "shortcuts", label: "热键" },
  { id: "ai", label: "AI" },
  { id: "appearance", label: "外观" },
];

const PROVIDERS = [
  {
    name: "DeepSeek",
    url: "https://api.deepseek.com",
    models: "deepseek-chat · deepseek-reasoner",
    status: "ok" as const,
  },
  {
    name: "Anthropic",
    url: "https://api.anthropic.com",
    models: "claude-sonnet-5 · claude-opus-5",
    status: "ok" as const,
  },
  {
    name: "Gemini",
    url: "https://generativelanguage.googleapis.com",
    models: "gemini-2.5-flash · gemini-2.5-pro",
    status: "ok" as const,
  },
  {
    name: "Ollama",
    url: "http://localhost:11434",
    models: "llama3.1 · qwen2.5",
    status: "warn" as const,
  },
];

const HOTKEYS = [
  { label: "划词唤起", desc: "任意应用选中文本", keys: ["⌥", "Space"], conflict: false },
  { label: "打开主窗口", desc: "已被系统占用", keys: ["⌘", "⇧", "L"], conflict: true },
  { label: "翻译浮窗", desc: "全局唤起浮窗", keys: ["⌃", "⌥", "T"], conflict: false },
];

const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "浅色" },
  { id: "dark", label: "深色" },
  { id: "system", label: "跟随系统" },
];

const LANG_OPTIONS = [
  { label: "中文", on: true },
  { label: "English", on: false },
  { label: "跟随系统", on: false },
];

const FUNC_MODELS = ["翻译", "命名", "解释", "全局默认"];

/** 设置分节（原型 .set-section）：标题 + 描述 + 内容，底边分隔。 */
function SetSection({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-border py-4 last:border-0 last:pb-0">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {desc ? (
        <p className="mb-3.5 mt-0.5 text-xs text-muted-foreground">{desc}</p>
      ) : null}
      {children}
    </section>
  );
}

/** 通用单元格：左标签 + 右内容/操作（原型 .func-cell）。 */
function FuncCell({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-background px-3.5 py-2.5">
      {children}
    </div>
  );
}

/**
 * 设置视图（§3 场景 6，对齐原型设置 panel）：
 * 二级标签（通用 / 热键 / AI / 外观）。主题真实联动 theme-store，
 * 其余为占位，待 V1 接入对应能力。
 */
export function SettingsView() {
  const [sub, setSub] = useState<Sub>("general");
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <ViewShell view="settings">
      <div className="flex h-full flex-col">
        {/* 二级标签 */}
        <nav
          aria-label="设置分组"
          className="mb-5 flex w-fit shrink-0 gap-0.5 rounded-sm border border-border bg-muted/30 p-0.5"
        >
          {SUBTABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSub(t.id)}
              aria-current={sub === t.id ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-[5px] px-3.5 py-1.5 text-sm font-medium transition-colors duration-fast",
                sub === t.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-auto">
          {sub === "general" && (
            <div>
              <SetSection
                title="语言映射"
                desc="命中映射用映射目标；原文等于界面语言时改为英文；全部未命中用全局默认。"
              >
                <div className="grid grid-cols-2 gap-3">
                  <FuncCell>
                    <span className="text-sm text-muted-foreground">English → 中文</span>
                    <Button variant="ghost" size="icon" aria-label="移除" title="V1 实装">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </FuncCell>
                  <FuncCell>
                    <span className="text-sm text-muted-foreground">中文 → English</span>
                    <Button variant="ghost" size="icon" aria-label="移除" title="V1 实装">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </FuncCell>
                </div>
                <div className="mt-2">
                  <Button variant="outline" size="sm" title="V1 实装">
                    <Plus className="h-3.5 w-3.5" />
                    添加映射
                  </Button>
                </div>
              </SetSection>

              <SetSection title="界面语言" desc="默认跟随系统，支持中 / 英。">
                <div className="flex gap-2">
                  {LANG_OPTIONS.map((o) => (
                    <label
                      key={o.label}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-sm border px-3.5 py-2 text-sm transition-colors duration-fast",
                        o.on
                          ? "border-foreground/20 bg-accent text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <input type="radio" name="lang" defaultChecked={o.on} className="accent-info" />
                      {o.label}
                    </label>
                  ))}
                </div>
              </SetSection>
            </div>
          )}

          {sub === "shortcuts" && (
            <div>
              <SetSection
                title="热键管理"
                desc="注册失败即视为冲突，浮窗提示并在设置页标红。点击热键重新捕获。"
              >
                <div className="flex flex-col gap-2">
                  {HOTKEYS.map((h) => (
                    <div
                      key={h.label}
                      className={cn(
                        "flex items-center gap-3 rounded-sm border bg-background px-3.5 py-2.5",
                        h.conflict
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-border",
                      )}
                    >
                      <span className="min-w-[130px] text-sm text-muted-foreground">
                        {h.label}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground/70">
                        {h.desc}
                      </span>
                      <span className="ml-auto flex items-center gap-1">
                        {h.keys.map((k) => (
                          <kbd key={k} className="kbd">
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
                  <Info className="h-3 w-3" />
                  「⌘⇧L」注册失败，疑似与系统快捷键冲突，请更换。
                </p>
              </SetSection>
            </div>
          )}

          {sub === "ai" && (
            <div>
              <SetSection
                title="LLM 提供商"
                desc="多提供商并存，按功能指定默认模型，全局默认兜底。仅使用你的 API Key，零内置计费。"
              >
                <div className="flex flex-col gap-2">
                  {PROVIDERS.map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center gap-3 rounded-lg border border-border bg-background px-3.5 py-3"
                    >
                      <span className="min-w-[120px] text-sm font-semibold">{p.name}</span>
                      <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                        {p.url}
                      </span>
                      <span className="hidden max-w-[220px] truncate font-mono text-[10px] text-muted-foreground/70 sm:block">
                        {p.models}
                      </span>
                      <Pill variant={p.status}>
                        {p.status === "ok" ? "已连接" : "本地"}
                      </Pill>
                      <Button variant="ghost" size="icon" aria-label="编辑" title="V1 实装">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5">
                  <Button variant="outline" size="sm" title="V1 实装">
                    <Plus className="h-3.5 w-3.5" />
                    添加提供商
                  </Button>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-xs text-muted-foreground">
                    功能默认模型（未指定时回退到全局默认）
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {FUNC_MODELS.map((f) => (
                      <FuncCell key={f}>
                        <span className="text-sm text-muted-foreground">{f}</span>
                        <Select
                          defaultValue="deepseek"
                          className="h-8 min-w-[180px] text-xs"
                        >
                          <option value="deepseek">DeepSeek · deepseek-chat</option>
                          <option value="sonnet">Anthropic · claude-sonnet-5</option>
                        </Select>
                      </FuncCell>
                    ))}
                  </div>
                </div>
              </SetSection>

              <SetSection
                title="Prompt 自定义"
                desc="留空则使用系统内置 Prompt（已做快照测试，防止风格回归）。"
              >
                <div className="mb-3.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">翻译 Prompt</span>
                    <Button variant="ghost" size="icon" aria-label="恢复默认" title="V1 实装">
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                  <Textarea
                    className="min-h-[70px] font-mono text-xs leading-relaxed"
                    placeholder="遵循开发行业语言，避让产品名 / 变量名 / 命令名，意译而非直译…"
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">命名 Prompt</span>
                  </div>
                  <Textarea
                    className="min-h-[70px] font-mono text-xs leading-relaxed"
                    placeholder="将中文描述转为符合规范的变量名候选，语义准确、简洁…"
                  />
                </div>
              </SetSection>
            </div>
          )}

          {sub === "appearance" && (
            <div>
              <SetSection title="主题" desc="浅色 / 深色 / 跟随系统。">
                <div className="flex gap-2">
                  {THEME_OPTIONS.map((o) => (
                    <label
                      key={o.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-sm border px-3.5 py-2 text-sm transition-colors duration-fast",
                        mode === o.id
                          ? "border-foreground/20 bg-accent text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <input
                        type="radio"
                        name="theme"
                        checked={mode === o.id}
                        onChange={() => setMode(o.id)}
                        className="accent-info"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </SetSection>
            </div>
          )}
        </div>
      </div>
    </ViewShell>
  );
}
