import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "./config-types";
import {
  canDiscoverProvider,
  generationCapabilities,
  isProfileActive,
  mergeDiscoveredModels,
  mergeSelectedModelIds,
  modelsForFeature,
  validGeneration,
} from "./provider-catalog";

const provider: ProviderConfig = {
  id: "openai",
  preset_id: "openai-responses",
  name: "OpenAI",
  protocol: "open_ai_responses",
  base_url: "https://api.openai.com",
  api_key: "test",
  auth: "bearer",
  parameter_profile: {
    protocol: "open_ai_responses",
    endpoint_scope: "https://api.openai.com",
    supports_temperature: true,
    max_output_field: "max_output_tokens",
    supports_reasoning: true,
  },
  models: [
    {
      id: "o3-mini",
      origin: "bundled_verified",
      source_url: "https://platform.openai.com/docs/models",
      verified_at: "2026-09-17",
      supported_features: ["translate"],
      supports_temperature: true,
      supports_max_output: true,
      supports_reasoning: true,
    },
  ],
};

describe("provider catalog helpers", () => {
  it("only enables the profile when protocol and endpoint still match", () => {
    expect(isProfileActive(provider)).toBe(true);
    expect(
      isProfileActive({ ...provider, base_url: "https://proxy.example.com" }),
    ).toBe(false);
    expect(
      isProfileActive({ ...provider, protocol: "open_ai_chat_completions" }),
    ).toBe(false);
  });

  it("only exposes discovery for a verified preset with a matching profile", () => {
    const preset = {
      id: "openai-responses",
      brand: "OpenAI",
      display_name: "OpenAI Responses",
      protocol: "open_ai_responses" as const,
      suggested_endpoints: ["https://api.openai.com"],
      auth: "bearer" as const,
      docs_url: "https://platform.openai.com/docs",
      discovery: "open_ai" as const,
      initial_model_ids: ["o3-mini"],
    };
    expect(canDiscoverProvider(provider, preset)).toBe(true);
    expect(canDiscoverProvider(provider, { ...preset, discovery: null })).toBe(
      false,
    );
    expect(
      canDiscoverProvider(
        { ...provider, base_url: "https://proxy.example.com" },
        preset,
      ),
    ).toBe(false);
  });

  it("filters selectable models by declared feature", () => {
    expect(modelsForFeature([provider], "translate")).toHaveLength(1);
    expect(modelsForFeature([provider], "naming")).toHaveLength(0);
  });

  it("shows generation controls only for an active supported Responses profile", () => {
    expect(generationCapabilities(provider, provider.models[0])).toEqual({
      temperature: true,
      maxOutput: true,
      reasoning: true,
    });
    expect(
      generationCapabilities(
        { ...provider, base_url: "https://proxy.example.com" },
        provider.models[0],
      ),
    ).toEqual({
      temperature: false,
      maxOutput: false,
      reasoning: false,
    });
  });

  it("merges selected discoveries without replacing manual entries", () => {
    expect(
      mergeSelectedModelIds("manual-a, manual-b", ["reported-a", "manual-a"]),
    ).toBe("manual-a, manual-b, reported-a");

    const existing = {
      ...provider.models[0],
      context_window: { value: 200_000, source: "user_override" as const },
    };
    const [merged] = mergeDiscoveredModels(
      [existing],
      [
        {
          ...existing,
          origin: "provider_reported",
          context_window: {
            value: 128_000,
            source: "provider_reported",
          },
          max_output_tokens: {
            value: 16_384,
            source: "provider_reported",
          },
        },
      ],
    );
    expect(merged.context_window).toEqual(existing.context_window);
    expect(merged.max_output_tokens?.value).toBe(16_384);
  });

  it("validates bounded temperature and integral max output values", () => {
    expect(validGeneration("1.2", "temperature")).toBe(1.2);
    expect(validGeneration("2.1", "temperature")).toBeNull();
    expect(validGeneration("128", "maxOutput")).toBe(128);
    expect(validGeneration("1.2", "maxOutput")).toBeNull();
  });
});
