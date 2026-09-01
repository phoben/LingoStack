import { type ReactNode, useEffect, useState } from "react";
import { Info, Plus, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SettingsAi } from "@/components/settings-ai";
import { registerHotkeys, type HotkeyStatus } from "@/lib/ipc";
import {
  MOD,
  type HotkeyBinding,
  type Language,
  type Theme,
} from "@/lib/config-types";
import { useConfigStore } from "@/stores/config-store";
import { useThemeStore } from "@/stores/theme-store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

type Sub = "general" | "shortcuts" | "ai" | "appearance";
const langs: Language[] = ["zh", "en", "ja"];
const labels: Record<Language, string> = {
  zh: "中文",
  en: "English",
  ja: "日本語",
};
const themes: Theme[] = ["light", "dark", "system"];

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
export function FuncCell({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      {children}
    </div>
  );
}

function displayCombo(binding: HotkeyBinding) {
  const m = binding.combo.mods;
  return [
    [MOD.CTRL, "Ctrl"],
    [MOD.ALT, "Alt"],
    [MOD.SHIFT, "Shift"],
    [MOD.SUPER, "Super"],
  ]
    .filter(([bit]) => (m & (bit as number)) !== 0)
    .map(([, name]) => name)
    .concat(binding.combo.key || "?")
    .join("+");
}
function capture(
  e: React.KeyboardEvent<HTMLInputElement>,
): HotkeyBinding["combo"] | null {
  e.preventDefault();
  const mods =
    (e.ctrlKey ? MOD.CTRL : 0) |
    (e.altKey ? MOD.ALT : 0) |
    (e.shiftKey ? MOD.SHIFT : 0) |
    (e.metaKey ? MOD.SUPER : 0);
  const ignored = ["Control", "Alt", "Shift", "Meta"];
  if (!mods || ignored.includes(e.key)) return null;
  return {
    mods,
    key:
      e.key === " "
        ? "Space"
        : e.key.length === 1
          ? e.key.toUpperCase()
          : e.key,
  };
}

export function SettingsView() {
  const [sub, setSub] = useState<Sub>("general");
  const config = useConfigStore((s) => s.config);
  const hotkeys = useConfigStore((s) => s.config?.hotkeys);
  const update = useConfigStore((s) => s.update);
  const error = useConfigStore((s) => s.error);
  const mode = useThemeStore((s) => s.mode);
  const setTheme = useThemeStore((s) => s.setMode);
  const [statuses, setStatuses] = useState<HotkeyStatus[]>([]);
  const [mapping, setMapping] = useState<[Language, Language]>(["en", "zh"]);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const t = useT();
  useEffect(() => {
    const p = listen<HotkeyStatus[]>("hotkey-status", (e) =>
      setStatuses(e.payload),
    );
    return () => {
      void p.then((u) => u());
    };
  }, []);
  useEffect(() => {
    if (!hotkeys) return;
    void registerHotkeys(hotkeys)
      .then(setStatuses)
      .catch((cause) => setHotkeyError(String(cause)));
  }, [hotkeys]);
  if (!config)
    return (
      <ViewShell>
        <p className="p-4 text-xs text-muted-foreground" aria-live="polite">
          {t("loadingSettings")}
        </p>
      </ViewShell>
    );
  const addMapping = async () => {
    if (
      mapping[0] === mapping[1] ||
      config.pair_mappings.some(([from]) => from === mapping[0])
    ) {
      setMappingError(t("mappingInvalid"));
      return;
    }
    setMappingError(null);
    await update((c) => ({
      ...c,
      pair_mappings: [...c.pair_mappings, mapping],
    }));
    const saveError = useConfigStore.getState().error;
    if (saveError)
      toast.error(t("actionFailed", { message: saveError }), {
        duration: 4000,
      });
    if (saveError) useConfigStore.getState().clearError();
    else toast.success(t("mappingAdded"));
  };
  const saveHotkeys = async (bindings: HotkeyBinding[]) => {
    const duplicates = new Set<string>();
    if (
      bindings.some((b) => {
        const value = displayCombo(b);
        if (duplicates.has(value)) return true;
        duplicates.add(value);
        return !b.combo.mods || !b.combo.key;
      })
    ) {
      setHotkeyError(t("shortcutInvalid"));
      return;
    }
    setHotkeyError(null);
    try {
      const nextStatuses = await registerHotkeys(bindings);
      setStatuses(nextStatuses);
      useConfigStore.setState({ config: { ...config, hotkeys: bindings } });
      if (nextStatuses.every((status) => status.registered)) {
        toast.success(t("hotkeysSaved"));
      }
    } catch (e) {
      setHotkeyError(String(e));
    }
  };
  return (
    <ViewShell
      toolbar={
        <nav aria-label="Settings sections" className="flex gap-0.5">
          {(["general", "shortcuts", "ai", "appearance"] as Sub[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSub(id)}
              aria-current={sub === id ? "page" : undefined}
              className={cn(
                "rounded-[5px] px-3.5 py-1.5 text-sm",
                sub === id
                  ? "bg-accent"
                  : "text-muted-foreground hover:bg-accent/60",
              )}
            >
              {
                {
                  general: t("general"),
                  shortcuts: t("shortcuts"),
                  ai: "AI",
                  appearance: t("appearance"),
                }[id]
              }
            </button>
          ))}
        </nav>
      }
    >
      <div className="h-full overflow-auto px-4 py-1" aria-live="polite">
        {sub === "general" && (
          <>
            <SetSection title={t("languageMappings")} desc={t("mappingsHelp")}>
              <div className="divide-y divide-border border-y">
                {config.pair_mappings.map(([from, to]) => (
                  <FuncCell key={from}>
                    <span>
                      {labels[from]} → {labels[to]}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("removeMapping", { from })}
                      onClick={() =>
                        void update((c) => ({
                          ...c,
                          pair_mappings: c.pair_mappings.filter(
                            ([x]) => x !== from,
                          ),
                        }))
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </FuncCell>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Select
                  value={mapping[0]}
                  onChange={(e) =>
                    setMapping([e.target.value as Language, mapping[1]])
                  }
                >
                  {langs.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </Select>
                <Select
                  value={mapping[1]}
                  onChange={(e) =>
                    setMapping([mapping[0], e.target.value as Language])
                  }
                >
                  {langs.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void addMapping()}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("add")}
                </Button>
              </div>
              {mappingError ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {mappingError}
                </p>
              ) : null}
            </SetSection>
            <SetSection title={t("interfaceLanguage")}>
              <label className="mr-3 text-sm">
                {t("interfaceLanguage")}{" "}
                <Select
                  value={config.ui_language}
                  onChange={(e) =>
                    void update((c) => ({
                      ...c,
                      ui_language: e.target.value as "system" | "zh" | "en",
                    }))
                  }
                >
                  <option value="system">{t("system")}</option>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </Select>
              </label>
              <label className="text-sm">
                {t("defaultTarget")}{" "}
                <Select
                  value={config.global_default_target}
                  onChange={(e) =>
                    void update((c) => ({
                      ...c,
                      global_default_target: e.target.value as Language,
                    }))
                  }
                >
                  {langs.map((l) => (
                    <option key={l}>{labels[l]}</option>
                  ))}
                </Select>
              </label>
            </SetSection>
          </>
        )}
        {sub === "shortcuts" && (
          <SetSection title={t("globalShortcuts")} desc={t("shortcutsHelp")}>
            <div className="divide-y divide-border border-y">
              {config.hotkeys.map((binding, index) => {
                const status = statuses.find(
                  (s) => s.action === binding.action,
                );
                return (
                  <div
                    key={binding.action}
                    className={cn(
                      "flex items-center gap-3 py-2",
                      status && !status.registered && "bg-destructive/5",
                    )}
                  >
                    <span className="min-w-36 text-sm">
                      {binding.action === "translate_selection"
                        ? t("translateSelection")
                        : t("showMainWindow")}
                    </span>
                    <input
                      aria-label={`${binding.action} shortcut`}
                      value={displayCombo(binding)}
                      onKeyDown={(e) => {
                        const combo = capture(e);
                        if (combo) {
                          const next = config.hotkeys.map((h, i) =>
                            i === index ? { ...h, combo } : h,
                          );
                          void saveHotkeys(next);
                        } else setHotkeyError(t("shortcutInvalid"));
                      }}
                      readOnly
                      className="w-44 rounded-sm border border-input bg-background px-2 py-1 font-mono text-xs"
                    />
                    {status?.error ? (
                      <span className="text-xs text-destructive">
                        {t("hotkeyRegistrationFailed")}
                        {status.error}
                      </span>
                    ) : (
                      <span className="text-xs text-success">
                        {status?.registered ? t("registered") : t("notChecked")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <Button
              className="mt-3"
              size="sm"
              onClick={() => void saveHotkeys(config.hotkeys)}
            >
              {t("saveReregister")}
            </Button>
            {hotkeyError ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                <Info className="mr-1 inline h-3 w-3" />
                {hotkeyError}
              </p>
            ) : null}
          </SetSection>
        )}
        {sub === "ai" && <SettingsAi />}
        {sub === "appearance" && (
          <>
            <SetSection title={t("theme")}>
              <div className="mt-2 flex flex-wrap gap-2">
                {themes.map((theme) => (
                  <label
                    key={theme}
                    className="flex cursor-pointer items-center gap-2 rounded-sm border border-input px-3 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    <input
                      type="radio"
                      name="theme"
                      checked={mode === theme}
                      onChange={() => setTheme(theme)}
                    />
                    {t(
                      theme === "light"
                        ? "themeLight"
                        : theme === "dark"
                          ? "themeDark"
                          : "themeSystem",
                    )}
                  </label>
                ))}
              </div>
            </SetSection>
            <SetSection title={t("prompts")} desc={t("promptsHelp")}>
              <div className="space-y-5">
                {(["translate", "naming", "explain", "doc_translate"] as const).map(
                  (feature) => (
                    <div key={feature} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <label
                          htmlFor={`prompt-${feature}`}
                          className="text-sm font-medium"
                        >
                          {t(
                            feature === "translate"
                              ? "translate"
                              : feature === "naming"
                                ? "naming"
                                : feature === "explain"
                                  ? "termExplanation"
                                : "documentModel",
                          )}
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void update((c) => ({
                              ...c,
                              prompt_overrides: {
                                ...c.prompt_overrides,
                                [feature]: null,
                              },
                            }))
                          }
                        >
                          {t("restoreBuiltIn")}
                        </Button>
                      </div>
                      <Textarea
                        id={`prompt-${feature}`}
                        value={config.prompt_overrides[feature] ?? ""}
                        onChange={(e) =>
                          void update((c) => ({
                            ...c,
                            prompt_overrides: {
                              ...c.prompt_overrides,
                              [feature]: e.target.value || null,
                            },
                          }))
                        }
                      />
                    </div>
                  ),
                )}
              </div>
            </SetSection>
          </>
        )}
        {error ? (
          <p role="alert" className="py-2 text-xs text-destructive">
            {t("configSaveFailed")}
            {error}
          </p>
        ) : null}
      </div>
    </ViewShell>
  );
}
