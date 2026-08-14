import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Pill } from "@/components/ui/pill";
import { ProviderForm } from "@/components/provider-form";
import { FuncCell, SetSection } from "@/components/views/settings-view";
import { useConfigStore } from "@/stores/config-store";
import type { ModelRef, ProviderConfig } from "@/lib/config-types";
import { useT } from "@/lib/i18n";

type ModelField = "translate" | "naming" | "global_default";

const FUNC_ROWS: ModelField[] = ["translate", "naming", "global_default"];

const ALL_MODEL_FIELDS = [
  "translate",
  "naming",
  "doc_translate",
  "global_default",
] as const;

/** 由提供商名生成稳定且唯一的 id（slug + 冲突追加数字）。 */
function genId(name: string, existing: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "provider";
  let id = base;
  let i = 1;
  while (existing.includes(id)) {
    i += 1;
    id = `${base}-${i}`;
  }
  return id;
}

/**
 * 设置页「AI」子标签：LLM 提供商 CRUD + 功能默认模型。
 * 经 config-store 读写 config.json（乐观更新 + 自动存盘）。
 */
export function SettingsAi() {
  const t = useT();
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const error = useConfigStore((s) => s.error);
  const [editing, setEditing] = useState<
    { mode: "add" } | { mode: "edit"; provider: ProviderConfig } | null
  >(null);

  if (!config) {
    return <p className="text-xs text-muted-foreground">{t("loadingSettings")}</p>;
  }

  const providers = config.providers;
  const existingIds = providers.map((p) => p.id);

  const handleSave = (p: ProviderConfig) => {
    if (editing?.mode === "edit") {
      const id = editing.provider.id;
      update((cfg) => ({
        ...cfg,
        providers: cfg.providers.map((x) => (x.id === id ? p : x)),
      }));
    } else {
      const id = genId(p.name || "provider", existingIds);
      update((cfg) => ({
        ...cfg,
        providers: [...cfg.providers, { ...p, id }],
      }));
    }
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    update((cfg) => {
      const models = { ...cfg.models };
      ALL_MODEL_FIELDS.forEach((f) => {
        if (models[f]?.provider_id === id) {
          models[f] = null;
        }
      });
      return {
        ...cfg,
        providers: cfg.providers.filter((x) => x.id !== id),
        models,
      };
    });
  };

  const setFeatureModel = (field: ModelField, value: string) => {
    update((cfg) => {
      const models = { ...cfg.models };
      if (!value) {
        models[field] = null;
      } else {
        const [provider_id, model] = value.split("::");
        const ref: ModelRef = { provider_id, model };
        models[field] = ref;
      }
      return { ...cfg, models };
    });
  };

  // 全部 provider 的 model 拼成 select 选项。
  const modelOptions = providers.flatMap((p) =>
    p.models.map((m) => ({
      value: `${p.id}::${m}`,
      label: `${p.name} · ${m}`,
    })),
  );

  return (
    <div>
      <SetSection
        title={t("llmProviders")}
        desc={t("providersHelp")}
      >
        {/* 提供商行表：行间浅线分隔，不逐条套卡片 */}
        <div className="divide-y divide-border border-t border-border">
          {providers.length === 0 ? (
            <p className="px-1 py-5 text-center text-xs text-muted-foreground">
              {t("noProvider")}
            </p>
          ) : (
            providers.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-1 py-3 transition-colors duration-fast hover:bg-accent/40"
              >
                <span className="min-w-[100px] text-sm font-semibold">
                  {p.name}
                </span>
                <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                  {p.base_url}
                </span>
                <span className="hidden max-w-[200px] truncate font-mono text-[10px] text-muted-foreground/70 sm:block">
                  {p.models.join(" · ") || t("unassigned")}
                </span>
                <Pill variant={p.api_key ? "ok" : "warn"}>
                  {p.api_key ? t("configured") : t("missingKey")}
                </Pill>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`编辑 ${p.name}`}
                  onClick={() => setEditing({ mode: "edit", provider: p })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`删除 ${p.name}`}
                  onClick={() => handleDelete(p.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>

        {editing ? (
          <div className="mt-2">
            <ProviderForm
              initial={editing.mode === "edit" ? editing.provider : undefined}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          <div className="mt-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing({ mode: "add" })}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("addProvider")}
            </Button>
          </div>
        )}

        <div className="mt-4">
          <p className="mb-2 text-xs text-muted-foreground">
            {t("featureDefault")}
          </p>
          <div className="divide-y divide-border border-t border-border">
            {FUNC_ROWS.map((field) => {
              const current = config.models[field];
              const value = current
                ? `${current.provider_id}::${current.model}`
                : "";
              const label =
                field === "translate"
                  ? t("translate")
                  : field === "naming"
                    ? t("naming")
                    : t("globalDefault");
              return (
                <FuncCell key={field}>
                  <span className="text-sm text-muted-foreground">
                    {label}
                  </span>
                  <Select
                    aria-label={`${label}默认模型`}
                    value={value}
                    onChange={(e) => setFeatureModel(field, e.target.value)}
                    className="h-8 min-w-[180px] text-xs"
                    disabled={modelOptions.length === 0}
                  >
                    <option value="">{t("unassigned")}</option>
                    {modelOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </FuncCell>
              );
            })}
          </div>
        </div>
      </SetSection>

      {error ? (
        <p className="mt-2 text-xs text-accent">{t("configSaveFailed")}{error}</p>
      ) : null}
    </div>
  );
}
