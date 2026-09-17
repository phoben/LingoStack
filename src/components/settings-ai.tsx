import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { ProviderForm } from "@/components/provider-form";
import { FuncCell, SetSection } from "@/components/views/settings-view";
import type { Feature, ModelRef, ProviderConfig } from "@/lib/config-types";
import {
  generationCapabilities,
  mergeGeneration,
  modelsForFeature,
  validGeneration,
} from "@/lib/provider-catalog";
import { useT } from "@/lib/i18n";
import { useConfigStore } from "@/stores/config-store";
import { toast } from "sonner";

type ModelField =
  "translate" | "naming" | "explain" | "doc_translate" | "global_default";
const FUNC_ROWS: ModelField[] = [
  "translate",
  "naming",
  "explain",
  "doc_translate",
  "global_default",
];

function genId(name: string, existing: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "provider";
  let id = base;
  let index = 1;
  while (existing.includes(id)) {
    index += 1;
    id = `${base}-${index}`;
  }
  return id;
}

function labelFor(field: ModelField, t: ReturnType<typeof useT>): string {
  if (field === "explain") return t("termExplanation");
  if (field === "doc_translate") return t("documentModel");
  if (field === "global_default") return t("globalDefault");
  return t(field);
}

function reasoningLabel(
  level: "low" | "medium" | "high",
  t: ReturnType<typeof useT>,
): string {
  if (level === "low") return t("reasoningLow");
  if (level === "medium") return t("reasoningMedium");
  return t("reasoningHigh");
}

/** 设置页 AI 子标签：提供商 CRUD、功能模型选择与协议允许的生成参数。 */
export function SettingsAi() {
  const t = useT();
  const config = useConfigStore((state) => state.config);
  const update = useConfigStore((state) => state.update);
  const [editing, setEditing] = useState<
    { mode: "add" } | { mode: "edit"; provider: ProviderConfig } | null
  >(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  if (!config)
    return (
      <p className="text-xs text-muted-foreground">{t("loadingSettings")}</p>
    );

  const providers = config.providers;
  const allOptions = providers.flatMap((provider) =>
    provider.models.map((model) => ({
      provider,
      model,
      value: `${provider.id}::${model.id}`,
      label: `${provider.name} · ${model.id}`,
    })),
  );

  const handleSave = async (provider: ProviderConfig) => {
    if (editing?.mode === "edit") {
      await update((current) => ({
        ...current,
        providers: current.providers.map((item) =>
          item.id === editing.provider.id ? provider : item,
        ),
      }));
    } else {
      const id = genId(
        provider.name || "provider",
        providers.map((item) => item.id),
      );
      await update((current) => ({
        ...current,
        providers: [...current.providers, { ...provider, id }],
      }));
    }
    const saveError = useConfigStore.getState().error;
    if (saveError) {
      toast.error(t("actionFailed", { message: saveError }), {
        duration: 4000,
      });
      useConfigStore.getState().clearError();
      return;
    }
    toast.success(
      t(editing?.mode === "edit" ? "providerUpdated" : "providerAdded"),
    );
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    await update((current) => {
      const models = { ...current.models };
      FUNC_ROWS.forEach((field) => {
        if (models[field]?.provider_id === id) models[field] = null;
      });
      return {
        ...current,
        providers: current.providers.filter((provider) => provider.id !== id),
        models,
      };
    });
    const saveError = useConfigStore.getState().error;
    if (saveError) {
      toast.error(t("actionFailed", { message: saveError }), {
        duration: 4000,
      });
      useConfigStore.getState().clearError();
    } else {
      toast.success(t("providerDeleted"));
    }
  };

  const setFeatureModel = (field: ModelField, value: string) => {
    void update((current) => {
      if (!value)
        return { ...current, models: { ...current.models, [field]: null } };
      const [provider_id, model] = value.split("::");
      const ref: ModelRef = { provider_id, model };
      return { ...current, models: { ...current.models, [field]: ref } };
    });
  };

  const setNumberGeneration = (
    field: ModelField,
    key: "temperature" | "max_output_tokens",
    value: string,
  ) => {
    const kind = key === "temperature" ? "temperature" : "maxOutput";
    const parsed = validGeneration(value, kind);
    if (value !== "" && parsed === null) {
      setGenerationError(t("invalidGeneration"));
      return;
    }
    setGenerationError(null);
    void update((current) => {
      const model = current.models[field];
      if (!model) return current;
      return {
        ...current,
        models: {
          ...current.models,
          [field]: {
            ...model,
            generation: mergeGeneration(model.generation, { [key]: parsed }),
          },
        },
      };
    });
  };

  const setReasoning = (field: ModelField, value: string) => {
    void update((current) => {
      const model = current.models[field];
      if (!model) return current;
      return {
        ...current,
        models: {
          ...current.models,
          [field]: {
            ...model,
            generation: mergeGeneration(model.generation, {
              reasoning_effort:
                value === "" ? null : (value as "low" | "medium" | "high"),
            }),
          },
        },
      };
    });
  };

  return (
    <div>
      <SetSection title={t("llmProviders")} desc={t("providersHelp")}>
        <div className="divide-y divide-border border-t border-border">
          {providers.length === 0 ? (
            <p className="px-1 py-5 text-center text-xs text-muted-foreground">
              {t("noProvider")}
            </p>
          ) : (
            providers.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center gap-3 px-1 py-3 transition-colors duration-fast hover:bg-accent/40"
              >
                <span className="min-w-[100px] text-sm font-semibold">
                  {provider.name}
                </span>
                <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                  {provider.base_url}
                </span>
                <span className="hidden max-w-[200px] truncate font-mono text-[10px] text-muted-foreground/70 sm:block">
                  {provider.models.map((model) => model.id).join(" · ") ||
                    t("unassigned")}
                </span>
                <Pill
                  variant={
                    provider.api_key || provider.auth === "none" ? "ok" : "warn"
                  }
                >
                  {provider.api_key || provider.auth === "none"
                    ? t("configured")
                    : t("missingKey")}
                </Pill>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${t("edit")} ${provider.name}`}
                  onClick={() => setEditing({ mode: "edit", provider })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${t("delete")} ${provider.name}`}
                  onClick={() => void handleDelete(provider.id)}
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
              key={
                editing.mode === "edit" ? `edit:${editing.provider.id}` : "add"
              }
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
              const label = labelFor(field, t);
              const current = config.models[field];
              const value = current
                ? `${current.provider_id}::${current.model}`
                : "";
              const provider = current
                ? providers.find((item) => item.id === current.provider_id)
                : undefined;
              const model = provider?.models.find(
                (item) => item.id === current?.model,
              );
              const capabilities = generationCapabilities(provider, model);
              const options =
                field === "global_default"
                  ? allOptions
                  : modelsForFeature(providers, field as Feature).map(
                      ({ provider: optionProvider, model: optionModel }) => ({
                        provider: optionProvider,
                        model: optionModel,
                        value: `${optionProvider.id}::${optionModel.id}`,
                        label: `${optionProvider.name} · ${optionModel.id}`,
                      }),
                    );
              return (
                <FuncCell key={field}>
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <Select
                    aria-label={label}
                    value={value}
                    onChange={(event) =>
                      setFeatureModel(field, event.target.value)
                    }
                    className="h-8 min-w-[180px] text-xs"
                    disabled={options.length === 0}
                  >
                    <option value="">
                      {field === "global_default"
                        ? t("unassigned")
                        : t("useGlobalDefaultModel")}
                    </option>
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  {capabilities.temperature ? (
                    <Input
                      aria-label={`${label} ${t("temperature")}`}
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={current?.generation?.temperature ?? ""}
                      onChange={(event) =>
                        setNumberGeneration(
                          field,
                          "temperature",
                          event.target.value,
                        )
                      }
                      className="h-8 w-20 text-xs"
                      placeholder={t("temperature")}
                    />
                  ) : null}
                  {capabilities.maxOutput ? (
                    <Input
                      aria-label={`${label} ${t("maxOutput")}`}
                      type="number"
                      min="1"
                      max={model?.max_output_tokens?.value}
                      step="1"
                      value={current?.generation?.max_output_tokens ?? ""}
                      onChange={(event) =>
                        setNumberGeneration(
                          field,
                          "max_output_tokens",
                          event.target.value,
                        )
                      }
                      className="h-8 w-24 text-xs"
                      placeholder={t("maxOutput")}
                    />
                  ) : null}
                  {capabilities.reasoning ? (
                    <Select
                      aria-label={`${label} ${t("reasoningEffort")}`}
                      value={current?.generation?.reasoning_effort ?? ""}
                      onChange={(event) =>
                        setReasoning(field, event.target.value)
                      }
                      className="h-8 w-24 text-xs"
                    >
                      <option value="">{t("defaultReasoning")}</option>
                      {(["low", "medium", "high"] as const).map((level) => (
                        <option key={level} value={level}>
                          {reasoningLabel(level, t)}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                </FuncCell>
              );
            })}
          </div>
          {generationError ? (
            <p role="alert" className="mt-2 text-xs text-accent">
              {generationError}
            </p>
          ) : null}
        </div>
      </SetSection>
    </div>
  );
}
