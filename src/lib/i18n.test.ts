import { describe, expect, it } from "vitest";
import { resolveLocale, t } from "./i18n";
describe("resolveLocale", () => {
  it("uses Chinese only for a Chinese system locale", () => {
    expect(resolveLocale("system", "zh-CN")).toBe("zh");
    expect(resolveLocale("system", "ja-JP")).toBe("en");
  });
  it("uses complete typed dictionaries for visible navigation and actions", () => {
    expect(t("zh", "settings")).toBe("设置");
    expect(t("en", "settings")).toBe("Settings");
    expect(t("zh", "translateAction")).toBe("翻译");
    expect(t("en", "translateAction")).toBe("Translate");
  });

  it("在原文输入提示中说明文本与图片输入方式", () => {
    expect(t("zh", "inputToTranslate")).toBe(
      "输入或粘贴文本，也可粘贴或拖入图片",
    );
    expect(t("en", "inputToTranslate")).toBe(
      "Enter or paste text, or paste/drop an image",
    );
  });
});
