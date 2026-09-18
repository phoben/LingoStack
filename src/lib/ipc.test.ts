import { describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {},
  invoke,
}));

import {
  cancelChat,
  cancelOcr,
  effectiveTranslationPrompt,
  recognizeImage,
} from "./ipc";

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

describe("OCR and cancellation IPC", () => {
  it("uses camelCase request fields and serializes only image bytes", async () => {
    invoke.mockResolvedValueOnce("recognized");
    const content = new Uint8Array([1, 2, 3]);

    await expect(
      recognizeImage("ocr-1", "image/png", "zh", content),
    ).resolves.toBe("recognized");
    expect(invoke).toHaveBeenCalledWith("recognize_image", {
      requestId: "ocr-1",
      mediaType: "image/png",
      sourceOverride: "zh",
      content: [1, 2, 3],
    });
  });

  it("cancels OCR and chat by exact request ID", async () => {
    invoke.mockResolvedValue(undefined);
    await cancelOcr("ocr-2");
    await cancelChat("translate-2");

    expect(invoke).toHaveBeenCalledWith("cancel_ocr", { requestId: "ocr-2" });
    expect(invoke).toHaveBeenCalledWith("cancel_chat", {
      requestId: "translate-2",
    });
  });
});
