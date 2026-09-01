import { describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {},
  invoke,
}));

import { effectiveTranslationPrompt } from "./ipc";

describe("effectiveTranslationPrompt", () => {
  it("sends the UI explanation language using Tauri camelCase arguments", async () => {
    invoke.mockResolvedValueOnce("system prompt");

    await expect(effectiveTranslationPrompt("ja", "zh", "en")).resolves.toBe(
      "system prompt",
    );
    expect(invoke).toHaveBeenCalledWith("effective_translation_prompt", {
      source: "ja",
      target: "zh",
      explanationLanguage: "en",
    });
  });
});
