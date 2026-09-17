import type { AppConfig, Feature, ModelRef } from "@/lib/config-types";

/** AI 功能在当前配置下是否能够发起请求的稳定判定结果。 */
export type AiConfigurationStatus = "ready" | "unassigned" | "unknown_provider" | "empty_model";

function modelForFeature(config: AppConfig, feature: Feature): ModelRef | null | undefined {
  return config.models[feature] ?? config.models.global_default;
}

/**
 * 镜像 Rust 的「功能默认 → 全局默认 → 提供商存在」规则。
 * 此处不探测网络或远程模型列表，避免把临时请求错误误判为配置错误。
 */
export function aiConfigurationStatus(config: AppConfig | null | undefined, feature: Feature): AiConfigurationStatus {
  if (!config) return "unassigned";
  const model = modelForFeature(config, feature);
  if (!model) return "unassigned";
  if (!model.model.trim()) return "empty_model";
  return config.providers.some((provider) => provider.id === model.provider_id)
    ? "ready"
    : "unknown_provider";
}

export function hasRunnableAiConfiguration(config: AppConfig | null | undefined, feature: Feature): boolean {
  return aiConfigurationStatus(config, feature) === "ready";
}

/** 配置尚在加载时不能把未知状态误导为“请设置 AI”。 */
export function hasKnownMissingAiConfiguration(
  config: AppConfig | null | undefined,
  feature: Feature,
): boolean {
  return config != null && !hasRunnableAiConfiguration(config, feature);
}

export class AiConfigurationError extends Error {
  constructor() {
    super("AI_CONFIGURATION_MISSING");
    this.name = "AiConfigurationError";
  }
}
