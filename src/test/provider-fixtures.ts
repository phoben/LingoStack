import type { ModelDescriptor, ProviderConfig } from "@/lib/config-types";

export function createModelDescriptor(
  overrides: Partial<ModelDescriptor> = {},
): ModelDescriptor {
  return {
    id: "model",
    origin: "user_entered",
    supported_features: ["translate", "naming", "explain", "doc_translate"],
    supports_temperature: false,
    supports_max_output: false,
    supports_reasoning: false,
    ...overrides,
  };
}

export function createProviderConfig(
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
  return {
    id: "provider",
    protocol: "open_ai_chat_completions",
    name: "Provider",
    base_url: "https://example.test",
    api_key: "key",
    auth: "bearer",
    models: [createModelDescriptor()],
    ...overrides,
  };
}
