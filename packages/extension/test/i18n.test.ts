import { describe, expect, test } from "vitest";

import { getUiStringTranslationStats, getUiStrings } from "../src/sidepanel/i18n.js";
import { listSupportedUiLanguageOptions } from "../src/ui-language.js";

describe("side panel i18n", () => {
  test("labels the tab picker as open tabs instead of recent tabs", () => {
    expect(getUiStrings("en").labels.recentTabs).toBe("Open tabs");
    expect(getUiStrings("ko").labels.recentTabs).toBe("열려 있는 탭");
  });

  test("uses public-facing Codex OAuth and suggested-question wording", () => {
    expect(getUiStrings("en").actions.chatgptLogin).toBe("Codex OAuth login");
    expect(getUiStrings("ko").actions.chatgptLogin).toBe("Codex OAuth 로그인");
    expect(getUiStrings("en").labels.actionCards).toBe("Suggested questions");
    expect(getUiStrings("ko").labels.actionCards).toBe("추천 질문");
    expect(getUiStrings("en").settings.uiTheme).toBe("Theme");
    expect(getUiStrings("ko").settings.themeLight).toBe("화이트");
    expect(getUiStrings("ko").help.emptyActions).toContain("추천 질문");
  });

  test("localizes core shell copy for every language exposed in settings", () => {
    const locales = listSupportedUiLanguageOptions()
      .map((option) => option.locale)
      .filter((locale) => locale !== "auto");

    for (const locale of locales) {
      const strings = getUiStrings(locale);
      expect(strings.labels.settings, locale).toBeTruthy();
      expect(strings.actions.send, locale).toBeTruthy();
      expect(strings.composerPlaceholder, locale).toBeTruthy();
      expect(strings.usageNotice.startCta, locale).toBeTruthy();
    }

    expect(getUiStrings("fr").labels.settings).toBe("Paramètres");
    expect(getUiStrings("ar").actions.send).toBe("إرسال");
    expect(getUiStrings("ja").composerPlaceholder).toContain("質問");
  });

  test("ships full static side panel translations for every selectable UI language", () => {
    const locales = listSupportedUiLanguageOptions()
      .map((option) => option.locale)
      .filter((locale) => locale !== "auto" && locale !== "en");

    for (const locale of locales) {
      const stats = getUiStringTranslationStats(locale);
      expect(stats.totalStaticStrings, locale).toBeGreaterThan(150);
      expect(stats.translatedStaticStrings, locale).toBe(stats.totalStaticStrings);
      expect(stats.missingStaticKeys, locale).toEqual([]);
      expect(JSON.stringify(getUiStrings(locale)), locale).not.toMatch(/@@\s*\d/u);
    }
  });

  test("applies non-English translations beyond the core shell labels", () => {
    const english = getUiStrings("en");
    const french = getUiStrings("fr");
    const japanese = getUiStrings("ja");

    expect(french.settingsPanel.generalDescription).not.toBe(english.settingsPanel.generalDescription);
    expect(french.permissions.currentSite).not.toBe(english.permissions.currentSite);
    expect(japanese.promptActivity.labels.responding).not.toBe(english.promptActivity.labels.responding);
    expect(japanese.errors.requestFailed).not.toBe(english.errors.requestFailed);
    expect(french.status.duplicateFile("brief.pdf")).toContain("brief.pdf");
    expect(french.status.duplicateFile("brief.pdf")).not.toBe(english.status.duplicateFile("brief.pdf"));
  });

  test("keeps local setup commands literal across every selectable UI language", () => {
    const locales = listSupportedUiLanguageOptions()
      .map((option) => option.locale)
      .filter((locale) => locale !== "auto");
    const expectedCommand = getUiStrings("en").onboarding.sourceInstallCommand;

    for (const locale of locales) {
      expect(getUiStrings(locale).onboarding.sourceInstallCommand, locale).toBe(expectedCommand);
    }
  });

  test("localizes site suggestion titles for every selectable UI language", () => {
    const locales = listSupportedUiLanguageOptions()
      .map((option) => option.locale)
      .filter((locale) => locale !== "auto");
    const cardIds = ["youtube-summary-question", "gmail-reply-draft", "news-article-summary", "arxiv-paper-summary"];

    for (const locale of locales) {
      const strings = getUiStrings(locale);
      for (const cardId of cardIds) {
        expect((strings.actionCards as Record<string, string>)[cardId], `${locale}:${cardId}`).toBeTruthy();
      }
    }

    expect(getUiStrings("fr").actionCards["youtube-summary-question"]).not.toBe(
      getUiStrings("en").actionCards["youtube-summary-question"],
    );
    expect(getUiStrings("ja").actionCards["news-article-summary"]).not.toBe(
      getUiStrings("en").actionCards["news-article-summary"],
    );
  });
});
