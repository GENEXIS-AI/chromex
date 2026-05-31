import { describe, expect, test } from "vitest";

import {
  detectUiLocale,
  formatUiLanguageOptionLabel,
  getTranslatedUiLocale,
  listSupportedUiLanguageOptions,
  normalizeUiLanguageSetting,
  resolveUiLocale,
} from "../src/ui-language.js";

describe("UI language support", () => {
  test("includes broad Codex-style language choices with automatic detection", () => {
    const options = listSupportedUiLanguageOptions();
    const locales = options.map((option) => option.locale);

    expect(locales[0]).toBe("auto");
    expect(locales).toContain("en");
    expect(locales).toContain("ko");
    expect(locales).toContain("ja");
    expect(locales).toContain("zh-CN");
    expect(locales).toContain("zh-TW");
    expect(locales).toContain("ar");
    expect(locales).toContain("fr");
  });

  test("normalizes browser locale variants to supported UI locales", () => {
    expect(detectUiLocale("ko-KR")).toBe("ko");
    expect(detectUiLocale("zh-Hant-TW")).toBe("zh-TW");
    expect(detectUiLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(detectUiLocale("pt-BR")).toBe("pt-BR");
    expect(detectUiLocale("pt-PT")).toBe("pt-PT");
    expect(detectUiLocale("xx-YY")).toBe("en");
  });

  test("resolves auto settings from the browser language and validates stored settings", () => {
    expect(normalizeUiLanguageSetting("fr")).toBe("fr");
    expect(normalizeUiLanguageSetting("bad-locale")).toBe("auto");
    expect(resolveUiLocale("auto", "ar-SA")).toBe("ar");
    expect(resolveUiLocale("ja", "ko-KR")).toBe("ja");
  });

  test("keeps every supported locale selectable instead of collapsing to Korean or English", () => {
    expect(getTranslatedUiLocale("ko")).toBe("ko");
    expect(getTranslatedUiLocale("fr")).toBe("fr");
    expect(getTranslatedUiLocale("ja")).toBe("ja");
    expect(getTranslatedUiLocale("ar")).toBe("ar");
    expect(getTranslatedUiLocale("zh-Hant-TW")).toBe("zh-TW");
    expect(
      formatUiLanguageOptionLabel(
        { locale: "fr", nativeName: "Français", englishName: "French", koreanName: "프랑스어" },
        "ko",
      ),
    ).toContain("프랑스어");
  });
});
