<<<<<<< HEAD
import { useState } from "react";
=======
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
>>>>>>> 1dbad488ffe5aef98ca852d3215bf57e46a4699d
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type {
  AuthScheme,
  Feature,
  ModelDescriptor,
  ProviderConfig,
  Protocol,
  ValueSource,
} from "@/lib/config-types";
import {
  discoverProviderModels,
  instantiateProviderPreset,
  listProviderPresets,
  type ProviderPreset,
} from "@/lib/ipc";
import {
  canDiscoverProvider,
  mergeDiscoveredModels,
  mergeSelectedModelIds,
} from "@/lib/provider-catalog";
import { useT } from "@/lib/i18n";

const PROTOCOL_OPTIONS: Protocol[] = [
  "open_ai_chat_completions",
  "anthropic_messages",
  "gemini_generate_content",
  "open_ai_responses",
];
const FEATURES: Feature[] = ["translate", "naming", "explain", "doc_translate"];
const AUTH_OPTIONS: AuthScheme[] = [
  "bearer",
  "anthropic_api_key",
  "gemini_api_key",
  "none",
];

function protocolLabel(protocol: Protocol, t: ReturnType<typeof useT>): string {
  if (protocol === "open_ai_chat_completions") return t("protocolOpenAiChat");
  if (protocol === "anthropic_messages") return t("protocolAnthropic");
  if (protocol === "gemini_generate_content") return t("protocolGemini");
  return t("protocolResponses");
}

function featureLabel(feature: Feature, t: ReturnType<typeof useT>): string {
  if (feature === "explain") return t("termExplanation");
  if (feature === "doc_translate") return t("documentModel");
  return t(feature);
}

interface ProviderFormProps {
  initial?: ProviderConfig;
  onSave: (provider: ProviderConfig) => void;
  onCancel: () => void;
}

function parseModelIds(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[，,\n\s]+/)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  );
}
function descriptorFor(id: string): ModelDescriptor {
  return {
    id,
    origin: "user_entered",
    supported_features: [...FEATURES],
    supports_temperature: false,
    supports_max_output: false,
    supports_reasoning: false,
  };
}

function originLabel(
  origin: ModelDescriptor["origin"],
  t: ReturnType<typeof useT>,
) {
  if (origin === "bundled_verified") return t("modelOriginBundled");
  if (origin === "provider_reported") return t("modelOriginReported");
  return t("modelOriginManual");
}

function valueSourceLabel(source: ValueSource, t: ReturnType<typeof useT>) {
  if (source === "bundled_verified") return t("modelOriginBundled");
  if (source === "provider_reported") return t("modelOriginReported");
  return t("unverifiedOverride");
}

function authLabel(auth: AuthScheme, t: ReturnType<typeof useT>) {
  if (auth === "bearer") return t("authBearer");
  if (auth === "anthropic_api_key") return t("authAnthropic");
  if (auth === "gemini_api_key") return t("authGemini");
  return t("authNone");
}

/** 提供商新增/编辑表单；预设只提供初始草稿，保存时仍由用户拥有全部字段。 */
export function ProviderForm({ initial, onSave, onCancel }: ProviderFormProps) {
  const t = useT();
  const [draft, setDraft] = useState<ProviderConfig>(
    () =>
      initial ?? {
        id: "",
        protocol: "open_ai_chat_completions",
        preset_id: null,
        name: "",
        base_url: "",
        api_key: "",
        auth: "bearer",
        parameter_profile: null,
        models: [],
      },
  );
  const [modelsText, setModelsText] = useState(
    () => initial?.models.map((model) => model.id).join(", ") ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);
<<<<<<< HEAD
=======
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(!initial);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<ModelDescriptor[]>([]);
  const [discoveryAttempted, setDiscoveryAttempted] = useState(false);
  const [modelListOpen, setModelListOpen] = useState(false);
  const [activeModelIndex, setActiveModelIndex] = useState(-1);
  const modelListId = useId();
  const modelControlRef = useRef<HTMLDivElement>(null);
  const [specOverrides, setSpecOverrides] = useState<
    Record<string, { context: string; output: string }>
  >(() =>
    Object.fromEntries(
      (initial?.models ?? []).map((model) => [
        model.id,
        {
          context:
            model.context_window?.source === "user_override"
              ? model.context_window.value.toString()
              : "",
          output:
            model.max_output_tokens?.source === "user_override"
              ? model.max_output_tokens.value.toString()
              : "",
        },
      ]),
    ),
  );

  useEffect(() => {
    if (initial && !initial.preset_id) {
      return;
    }
    void listProviderPresets()
      .then(setPresets)
      .catch(() => setError(t("presetListFailed")))
      .finally(() => setPresetsLoading(false));
  }, [initial, t]);

  useEffect(() => {
    if (!modelListOpen) return;
    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (!modelControlRef.current?.contains(event.target as Node)) {
        setModelListOpen(false);
        setActiveModelIndex(-1);
      }
    };
    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, [modelListOpen]);

  const modelIds = useMemo(() => parseModelIds(modelsText), [modelsText]);
  const selectedPreset = presets.find((preset) => preset.id === draft.preset_id);
  const canDiscover = canDiscoverProvider(draft, selectedPreset);
  const updateDraft = (patch: Partial<ProviderConfig>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const choosePreset = async (presetId: string) => {
    if (!presetId) return;
    try {
      const presetDraft = await instantiateProviderPreset(presetId);
      setDraft({ ...presetDraft, id: initial?.id ?? presetDraft.id });
      setModelsText(presetDraft.models.map((model) => model.id).join(", "));
      setSpecOverrides(
        Object.fromEntries(
          presetDraft.models.map((model) => [
            model.id,
            {
              context:
                model.context_window?.source === "user_override"
                  ? model.context_window.value.toString()
                  : "",
              output:
                model.max_output_tokens?.source === "user_override"
                  ? model.max_output_tokens.value.toString()
                  : "",
            },
          ]),
        ),
      );
      setDiscovered([]);
      setDiscoveryAttempted(false);
      setModelListOpen(false);
      setActiveModelIndex(-1);
      setDiscoveryError(null);
    } catch {
      setError(t("presetLoadFailed"));
    }
  };

  const updateFeature = (
    modelId: string,
    feature: Feature,
    checked: boolean,
  ) => {
    setDraft((current) => {
      const existing = current.models.find((model) => model.id === modelId);
      const base = existing ?? descriptorFor(modelId);
      const updated = {
        ...base,
        supported_features: checked
          ? [...new Set([...base.supported_features, feature])]
          : base.supported_features.filter((item) => item !== feature),
      };
      return {
        ...current,
        models: existing
          ? current.models.map((model) =>
              model.id === modelId ? updated : model,
            )
          : [...current.models, updated],
      };
    });
  };
>>>>>>> 1dbad488ffe5aef98ca852d3215bf57e46a4699d

  const submit = () => {
    if (
      !draft.name.trim() ||
      !draft.base_url.trim() ||
      (draft.auth !== "none" && !draft.api_key.trim())
    ) {
      setError(t("providerRequired"));
      return;
    }
    if (
      draft.protocol === "open_ai_responses" &&
      (draft.preset_id !== "openai-responses" ||
        draft.base_url !== "https://api.openai.com")
    ) {
      setError(t("officialResponsesOnly"));
      return;
    }
    const invalidSpec = modelIds.some((id) => {
      const override = specOverrides[id];
      return [override?.context, override?.output].some(
        (value) =>
          value !== undefined &&
          value !== "" &&
          (!Number.isInteger(Number(value)) || Number(value) < 1),
      );
    });
    if (invalidSpec) {
      setError(t("invalidModelSpec"));
      return;
    }

    const known = new Map(draft.models.map((model) => [model.id, model]));
    const models = modelIds.map((id) => {
      const base = known.get(id) ?? descriptorFor(id);
      const override = specOverrides[id];
      return {
        ...base,
        context_window: override?.context
          ? {
              value: Number(override.context),
              source: "user_override" as const,
            }
          : base.context_window,
        max_output_tokens: override?.output
          ? { value: Number(override.output), source: "user_override" as const }
          : base.max_output_tokens,
      };
    });
    onSave({
      ...draft,
      name: draft.name.trim(),
      base_url: draft.base_url.trim(),
      models,
    });
  };

  const refreshModels = async () => {
    setDiscovering(true);
    setDiscoveryError(null);
    try {
      const found = await discoverProviderModels(draft);
      setDiscovered(
        found.map((model) => ({ ...model, origin: "provider_reported" })),
      );
      setDiscoveryAttempted(true);
      setModelListOpen(found.length > 0);
      setActiveModelIndex(found.length > 0 ? 0 : -1);
    } catch {
      setDiscoveryError(t("refreshModelsFailed"));
    } finally {
      setDiscovering(false);
    }
  };

  const toggleDiscoveredModel = (model: ModelDescriptor) => {
    const selected = modelIds.includes(model.id);
    setDraft((current) => {
      if (selected) {
        return {
          ...current,
          models: current.models.filter((item) => item.id !== model.id),
        };
      }
      return {
        ...current,
        models: mergeDiscoveredModels(current.models, [model]),
      };
    });
    setModelsText((current) => {
      if (selected) {
        return parseModelIds(current)
          .filter((id) => id !== model.id)
          .join(", ");
      }
      return mergeSelectedModelIds(current, [model.id]);
    });
    if (selected) {
      setSpecOverrides((current) => {
        const remaining = { ...current };
        delete remaining[model.id];
        return remaining;
      });
    }
  };

  const handleModelInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") {
      setModelListOpen(false);
      setActiveModelIndex(-1);
      return;
    }
    if (discovered.length === 0) return;
    if (event.key === "Escape") {
      setModelListOpen(false);
      setActiveModelIndex(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setModelListOpen(true);
      setActiveModelIndex((current) => {
        if (event.key === "ArrowDown") {
          return current < 0 ? 0 : Math.min(current + 1, discovered.length - 1);
        }
        return current < 0 ? discovered.length - 1 : Math.max(current - 1, 0);
      });
      return;
    }
    if (event.key === "Enter" && modelListOpen && activeModelIndex >= 0) {
      event.preventDefault();
      toggleDiscoveredModel(discovered[activeModelIndex]);
    }
  };

  return (
    <div className="border-y border-border py-3.5">
      <div className="grid grid-cols-2 gap-3">
        {!initial ? (
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {t("providerPreset")}
            </span>
            <Select
              aria-label={t("providerPreset")}
              defaultValue=""
              disabled={presetsLoading}
              aria-busy={presetsLoading}
              onChange={(event) => void choosePreset(event.target.value)}
            >
              <option value="">{t("customProvider")}</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.display_name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("providerName")}
          </span>
          <Input
            value={draft.name}
            onChange={(event) => updateDraft({ name: event.target.value })}
            placeholder="DeepSeek"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("providerProtocol")}
          </span>
          <Select
            value={draft.protocol}
            onChange={(event) =>
              updateDraft({ protocol: event.target.value as Protocol })
            }
            className="h-9 w-full"
          >
            {PROTOCOL_OPTIONS.map((protocol) => (
              <option key={protocol} value={protocol}>
                {protocolLabel(protocol, t)}
              </option>
            ))}
          </Select>
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("providerAuth")}
          </span>
          <Select
            aria-label={t("providerAuth")}
            value={draft.auth}
            onChange={(event) =>
              updateDraft({ auth: event.target.value as AuthScheme })
            }
          >
            {AUTH_OPTIONS.map((auth) => (
              <option key={auth} value={auth}>
                {authLabel(auth, t)}
              </option>
            ))}
          </Select>
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("baseUrl")}</span>
          <Input
            value={draft.base_url}
            onChange={(event) => updateDraft({ base_url: event.target.value })}
            className="font-mono text-xs"
            placeholder="https://api.deepseek.com"
          />
        </label>
<<<<<<< HEAD
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">API Key</span>
          <div className="relative">
            <Input
              type={keyVisible ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-9 font-mono text-xs"
              placeholder="sk-..."
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-9 w-9"
              aria-label={t(keyVisible ? "hideApiKey" : "showApiKey")}
              aria-pressed={keyVisible}
              onClick={() => setKeyVisible((visible) => !visible)}
            >
              {keyVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </label>
=======
        {selectedPreset && selectedPreset.suggested_endpoints.length > 1 ? (
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {t("suggestedEndpoint")}
            </span>
            <Select
              value={
                selectedPreset.suggested_endpoints.includes(draft.base_url)
                  ? draft.base_url
                  : ""
              }
              onChange={(event) =>
                event.target.value &&
                updateDraft({ base_url: event.target.value })
              }
            >
              <option value="">{t("customEndpoint")}</option>
              {selectedPreset.suggested_endpoints.map((endpoint) => (
                <option key={endpoint} value={endpoint}>
                  {endpoint}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
>>>>>>> 1dbad488ffe5aef98ca852d3215bf57e46a4699d
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("apiKey")}
            {draft.auth === "none" ? ` (${t("optional")})` : ""}
          </span>
          <div className="relative">
            <Input
              type={keyVisible ? "text" : "password"}
              value={draft.api_key}
              onChange={(event) => updateDraft({ api_key: event.target.value })}
              className="pr-9 font-mono text-xs"
              placeholder="sk-..."
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-9 w-9"
              aria-label={t(keyVisible ? "hideApiKey" : "showApiKey")}
              aria-pressed={keyVisible}
              onClick={() => setKeyVisible((visible) => !visible)}
            >
              {keyVisible ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </label>
        <div
          ref={modelControlRef}
          className="col-span-2 flex flex-col gap-1"
          aria-live="polite"
          aria-busy={discovering}
        >
          <span id={`${modelListId}-label`} className="text-xs text-muted-foreground">
            {t("providerModels")}
          </span>
          <div className="flex gap-2">
            <Input
              value={modelsText}
              onChange={(event) => setModelsText(event.target.value)}
              onFocus={() => discovered.length > 0 && setModelListOpen(true)}
              onKeyDown={handleModelInputKeyDown}
              role="combobox"
              aria-labelledby={`${modelListId}-label`}
              aria-controls={modelListOpen ? modelListId : undefined}
              aria-expanded={modelListOpen}
              aria-activedescendant={
                modelListOpen && activeModelIndex >= 0
                  ? `${modelListId}-${activeModelIndex}`
                  : undefined
              }
              className="min-w-0 flex-1 font-mono text-xs"
              placeholder="deepseek-chat, deepseek-reasoner"
            />
            {canDiscover ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={discovering}
                onClick={() => void refreshModels()}
              >
                {t("refreshModels")}
              </Button>
            ) : null}
          </div>
          {discoveryError ? (
            <p role="alert" className="text-xs text-accent">
              {discoveryError}
            </p>
          ) : null}
          {discoveryAttempted && discovered.length === 0 && !discoveryError ? (
            <p className="text-xs text-muted-foreground">{t("noModelsFound")}</p>
          ) : null}
          {modelListOpen && discovered.length > 0 ? (
            <div
              id={modelListId}
              role="listbox"
              aria-label={t("availableModels")}
              aria-multiselectable="true"
              className="max-h-40 overflow-y-auto border border-border bg-background py-1"
            >
              {discovered.map((model, index) => {
                const selected = modelIds.includes(model.id);
                return (
                  <button
                    key={model.id}
                    id={`${modelListId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggleDiscoveredModel(model)}
                  >
                    <span aria-hidden="true">{selected ? "✓" : ""}</span>
                    {model.id}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        {modelIds.map((id) => {
          const model =
            draft.models.find((item) => item.id === id) ?? descriptorFor(id);
          const override = specOverrides[id] ?? { context: "", output: "" };
          const contextSource = override.context
            ? "user_override"
            : model.context_window?.source;
          const outputSource = override.output
            ? "user_override"
            : model.max_output_tokens?.source;
          return (
            <div
              key={id}
              className="col-span-2 border-t border-border py-2 text-xs"
              aria-label={t("modelDetails", { id })}
            >
              <div className="flex flex-wrap gap-2 pb-2">
                <span className="font-mono">{id}</span>
                <span>
                  {t("modelOrigin")}: {originLabel(model.origin, t)}
                </span>
                {model.source_url ? (
                  <a
                    className="text-info underline"
                    href={model.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("modelSourceLink")}
                  </a>
                ) : null}
                {model.verified_at ? (
                  <span>{t("verifiedAt", { date: model.verified_at })}</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 py-2">
                <label className="min-w-[180px] flex-1">
                  <span className="mb-1 block text-muted-foreground">
                    {t("contextWindow")}: {override.context || model.context_window?.value || t("unknown")}
                    {contextSource
                      ? ` · ${valueSourceLabel(contextSource, t)}`
                      : ""}
                  </span>
                  <Input
                    aria-label={`${id} ${t("contextWindow")}`}
                    type="number"
                    min="1"
                    step="1"
                    placeholder={t("overrideValue")}
                    value={override.context}
                    onChange={(event) =>
                      setSpecOverrides((old) => ({
                        ...old,
                        [id]: { ...override, context: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="min-w-[180px] flex-1">
                  <span className="mb-1 block text-muted-foreground">
                    {t("maxOutput")}: {override.output || model.max_output_tokens?.value || t("unknown")}
                    {outputSource
                      ? ` · ${valueSourceLabel(outputSource, t)}`
                      : ""}
                  </span>
                  <Input
                    aria-label={`${id} ${t("maxOutput")}`}
                    type="number"
                    min="1"
                    step="1"
                    placeholder={t("overrideValue")}
                    value={override.output}
                    onChange={(event) =>
                      setSpecOverrides((old) => ({
                        ...old,
                        [id]: { ...override, output: event.target.value },
                      }))
                    }
                  />
                </label>
              </div>
              <p className="py-2 text-muted-foreground">
                {t("parameterSupport")}: {t("temperature")} {model.supports_temperature ? t("supported") : t("unsupported")} · {t("maxOutput")} {model.supports_max_output ? t("supported") : t("unsupported")} · {t("reasoningEffort")} {model.supports_reasoning ? t("supported") : t("unsupported")}
              </p>
              <div
                className="flex flex-wrap gap-2 pt-2"
                aria-label={`${id} ${t("featureCapabilities")}`}
              >
                {FEATURES.map((feature) => (
                  <label key={feature}>
                    <input
                      type="checkbox"
                      checked={model.supported_features.includes(feature)}
                      onChange={(event) =>
                        updateFeature(id, feature, event.target.checked)
                      }
                    />{" "}
                    {featureLabel(feature, t)}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-accent">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={submit}>
          {initial ? t("save") : t("add")}
        </Button>
      </div>
    </div>
  );
}
