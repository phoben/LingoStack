import { type ReactNode, useState } from "react";
import { Info, Plus, X } from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import { SettingsAi } from "@/components/settings-ai";
import { useThemeStore, type ThemeMode } from "@/stores/theme-store";
import { cn } from "@/lib/utils";

type Sub = "general" | "shortcuts" | "ai" | "appearance";

const SUBTABS: { id: Sub; label: string }[] = [
  { id: "general", label: "通用" },
  { id: "shortcuts", label: "热键" },
  { id: "ai", label: "AI" },
  { id: "appearance", label: "外观" },
];

const HOTKEYS = [
  {
    label: "划词唤起",
    desc: "任意应用选中文本",
    keys: ["⌥", "Space"],
    conflict: false,
  },
  {
    label: "打开主窗口",
    desc: "已被系统占用",
    keys: ["⌘", "⇧", "L"],
    conflict: true,
  },
  {
    label: "翻译浮窗",
    desc: "全局唤起浮窗",
    keys: ["⌃", "⌥", "T"],
    conflict: false,
  },
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

/** 设置分节（原型 .set-section）：标题 + 描述 + 内容，底边分隔。 */
export function SetSection({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-border py-5 first:pt-3 last:border-0">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {desc ? (
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{desc}</p>
      ) : null}
      {children}
    </section>
  );
}

/**
 * 通用单元格：左标签 + 右内容/操作（原型 .func-cell）。
 * 无描边无底色——同类单元格之间靠父级的分割线区分，避免卡片套卡片。
 */
export function FuncCell({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      {children}
    </div>
  );
}

/**
 * 设置视图（§3 场景 6，对齐原型设置 panel）：
 * 二级标签（通用 / 热键 / AI / 外观）。AI 子标签已接入真实配置（providers +
 * 功能默认模型），主题真实联动 theme-store，其余为占位待后续能力接入。
 */
export function SettingsView() {
  const [sub, setSub] = useState<Sub>("general");
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <ViewShell
      toolbar={
        <nav
          aria-label="设置分组"
          className="flex flex-wrap items-center gap-0.5"
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
      }
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-auto px-4 py-1">
          {sub === "general" && (
            <div>
              <SetSection
                title="语言映射"
                desc="命中映射用映射目标；原文等于界面语言时改为英文；全部未命中用全局默认。"
              >
                <div className="divide-y divide-border border-t border-border">
                  <FuncCell>
                    <span className="text-sm text-muted-foreground">
                      English → 中文
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="移除"
                      title="V1 实装"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </FuncCell>
                  <FuncCell>
                    <span className="text-sm text-muted-foreground">
                      中文 → English
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="移除"
                      title="V1 实装"
                    >
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
                      <input
                        type="radio"
                        name="lang"
                        defaultChecked={o.on}
                        className="accent-info"
                      />
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
                <div className="divide-y divide-border border-y border-border">
                  {/* 热键行表：行间浅线分隔，冲突行仅用底色标记，不套描边卡片 */}
                  {HOTKEYS.map((h) => (
                    <div
                      key={h.label}
                      className={cn(
                        "flex items-center gap-3 px-1 py-2.5",
                        h.conflict && "bg-destructive/5",
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

          {sub === "ai" && <SettingsAi />}

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
