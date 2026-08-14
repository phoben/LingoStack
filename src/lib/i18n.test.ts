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
});
