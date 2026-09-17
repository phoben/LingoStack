import type {
  Feature,
  GenerationSettings,
  ModelDescriptor,
  ParameterProfile,
  ProviderConfig,
  SourcedValue,
} from "./config-types";
import type { ProviderPreset } from "./ipc";

export function isProfileActive(provider: ProviderConfig): boolean {
  return (
    provider.parameter_profile?.protocol === provider.protocol &&
    provider.parameter_profile.endpoint_scope === provider.base_url
  );
}

export function canDiscoverProvider(
  provider: ProviderConfig,
  preset: ProviderPreset | undefined,
): boolean {
  return Boolean(preset?.discovery) && isProfileActive(provider);
}

export function modelsForFeature(
  providers: ProviderConfig[],
  feature: Feature,
): Array<{ provider: ProviderConfig; model: ModelDescriptor }> {
  return providers.flatMap((provider) =>
    provider.models
      .filter((model) => model.supported_features.includes(feature))
      .map((model) => ({ provider, model })),
  );
}

export function generationCapabilities(
  provider: ProviderConfig | undefined,
  model: ModelDescriptor | undefined,
): { temperature: boolean; maxOutput: boolean; reasoning: boolean } {
  const profile: ParameterProfile | undefined =
    provider?.parameter_profile ?? undefined;
  const active = !!provider && isProfileActive(provider);
  return {
    temperature:
      active &&
      !!profile?.supports_temperature &&
      !!model?.supports_temperature,
    maxOutput:
      active && !!profile?.max_output_field && !!model?.supports_max_output,
    reasoning:
      active &&
      provider?.protocol === "open_ai_responses" &&
      !!profile?.supports_reasoning &&
      !!model?.supports_reasoning,
  };
}

export function mergeSelectedModelIds(
  manual: string,
  selected: string[],
): string {
  return Array.from(
    new Set([...manual.split(/[，,\n\s]+/).filter(Boolean), ...selected]),
  ).join(", ");
}

export function mergeDiscoveredModels(
  existing: ModelDescriptor[],
  discovered: ModelDescriptor[],
): ModelDescriptor[] {
  const merged = existing.map((model) => ({ ...model }));
  for (const candidate of discovered) {
    const index = merged.findIndex((model) => model.id === candidate.id);
    if (index < 0) {
      merged.push(candidate);
      continue;
    }
    const current = merged[index];
    const mergeValue = <T,>(
      oldValue: SourcedValue<T> | null | undefined,
      newValue: SourcedValue<T> | null | undefined,
    ): SourcedValue<T> | null | undefined =>
      newValue && (!oldValue || oldValue.source === "provider_reported")
        ? newValue
        : oldValue;
    merged[index] = {
      ...current,
      context_window: mergeValue(
        current.context_window,
        candidate.context_window,
      ),
      max_output_tokens: mergeValue(
        current.max_output_tokens,
        candidate.max_output_tokens,
      ),
    };
  }
  return merged;
}

export function validGeneration(
  value: string,
  kind: "temperature" | "maxOutput",
): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    (kind === "temperature" && (parsed < 0 || parsed > 2)) ||
    (kind === "maxOutput" && (!Number.isInteger(parsed) || parsed < 1))
  )
    return null;
  return parsed;
}

export function mergeGeneration(
  current: GenerationSettings | null | undefined,
  patch: Partial<GenerationSettings>,
): GenerationSettings {
  return { ...current, ...patch };
}
