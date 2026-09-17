import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config-types";
import {
  aiConfigurationStatus,
  hasKnownMissingAiConfiguration,
} from "./ai-configuration";

const configured = () => ({
  ...defaultConfig(),
  providers: [{ id: "p", kind: "open_ai_compatible" as const, name: "P", base_url: "https://example.test", api_key: "key", models: ["m"] }],
});

describe("aiConfigurationStatus", () => {
  it("功能模型优先，其次回退到全局默认", () => {
    const config = {
      ...configured(),
      models: {
        global_default: { provider_id: "p", model: "m" },
        translate: null,
      },
    };
    expect(aiConfigurationStatus(config, "translate")).toBe("ready");
  });
  it("识别未分配、孤儿提供商和空模型", () => {
    expect(aiConfigurationStatus(defaultConfig(), "naming")).toBe("unassigned");
    expect(aiConfigurationStatus({ ...configured(), models: { naming: { provider_id: "gone", model: "m" } } }, "naming")).toBe("unknown_provider");
    expect(aiConfigurationStatus({ ...configured(), models: { naming: { provider_id: "p", model: " " } } }, "naming")).toBe("empty_model");
  });

  it("配置尚在加载时不误报为配置缺失", () => {
    expect(hasKnownMissingAiConfiguration(null, "translate")).toBe(false);
    expect(
      hasKnownMissingAiConfiguration(defaultConfig(), "translate"),
    ).toBe(true);
  });
});
