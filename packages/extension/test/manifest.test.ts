import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const CHROME_WEB_STORE_LOCALES = [
  "ar",
  "am",
  "bg",
  "bn",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "en_AU",
  "en_GB",
  "en_US",
  "es",
  "es_419",
  "et",
  "fa",
  "fi",
  "fil",
  "fr",
  "gu",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "kn",
  "ko",
  "lt",
  "lv",
  "ml",
  "mr",
  "ms",
  "nl",
  "no",
  "pl",
  "pt_BR",
  "pt_PT",
  "ro",
  "ru",
  "sk",
  "sl",
  "sr",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "vi",
  "zh_CN",
  "zh_TW",
] as const;

const REQUIRED_CHROME_MESSAGE_KEYS = [
  "extensionName",
  "extensionDescription",
  "actionOpenSidePanel",
  "commandOpenSidePanel",
  "commandOpenPopup",
  "commandStartDictation",
  "contextAskPage",
  "contextAskSelection",
  "contextEditImage",
  "contextSummarizeYoutube",
] as const;

describe("extension manifest", () => {
  test("declares core page and tab access and uses a stable public key for unpacked native host installs", () => {
    const manifestPath = resolve(dirname(fileURLToPath(import.meta.url)), "../public/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      action?: {
        default_icon?: Record<string, string>;
        default_title?: string;
      };
      icons?: Record<string, string>;
      key?: string;
      name?: string;
      permissions?: string[];
      optional_permissions?: string[];
      host_permissions?: string[];
      content_scripts?: Array<{
        matches?: string[];
        js?: string[];
      }>;
      web_accessible_resources?: unknown[];
    };

    expect(manifest.name).toBe("__MSG_extensionName__");
    expect(manifest.icons?.["128"]).toBe("icons/codex-128.png");
    expect(manifest.action?.default_title).toBe("__MSG_actionOpenSidePanel__");
    expect(manifest.action?.default_icon?.["32"]).toBe("icons/codex-32.png");
    expect(manifest.key).toBe("MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuP+A4d/pFvVoYH/4yByEMq1JknmBMcsBo5hbyjFDRthp9GrAWTnksc0X/dP5kftZ45O+IlfP6rfg5w7ktNDt7tuJ0TpslnQEUvzC9D0CkEWzj6OmuWgY7nCtmnuHHItp1xJR9RsCDMNg9qFf54EiCf6eyTDrkJnn1yeIx/rIZRcbqnFjBLrVsuSz18L21/b+zQ8o+xzPWWhOYGVnuxuQvL57/MiDfSJ5zI0xgnYgMP/OXhdRTKmJeu/0pdEcrk2y1WgAE2LfI0jKjF6VIjKmDHabJRlP3/UZy6siRFHPZs2Q5Eh+Wxb0MtfiXN2r64R9p7MjGOkaw71GH+itEiAxuwIDAQAB");
    expect(manifest.permissions ?? []).toContain("tabs");
    expect(manifest.permissions ?? []).toContain("desktopCapture");
    expect(manifest.host_permissions ?? []).toContain("<all_urls>");
    expect(manifest.optional_permissions ?? []).not.toContain("tabs");
    expect(manifest.optional_permissions ?? []).not.toContain("tabCapture");
    expect(manifest.content_scripts ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          matches: expect.arrayContaining(["file:///*"]),
          js: ["content.js"],
        }),
      ]),
    );
    expect(manifest.web_accessible_resources).toEqual([
      {
        resources: ["icons/codex-32.png"],
        matches: ["<all_urls>"],
      },
    ]);
  });

  test("ships Chromex localized name and icon assets", () => {
    const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
    const englishMessages = JSON.parse(
      readFileSync(resolve(publicDir, "_locales/en/messages.json"), "utf8"),
    ) as { extensionName?: { message?: string } };
    const koreanMessages = JSON.parse(
      readFileSync(resolve(publicDir, "_locales/ko/messages.json"), "utf8"),
    ) as { extensionName?: { message?: string } };

    expect(englishMessages.extensionName?.message).toBe("Chromex");
    expect(koreanMessages.extensionName?.message).toBe("Chromex");
    for (const size of [16, 24, 32, 48, 128]) {
      expect(existsSync(resolve(publicDir, `icons/codex-${size}.png`))).toBe(true);
    }
    expect(existsSync(resolve(publicDir, "icons/codex-source.jpeg"))).toBe(true);
    expect(existsSync(resolve(publicDir, "icons/chromex-source.png"))).toBe(true);
    expect(existsSync(resolve(publicDir, "icons/chromex-line-source.png"))).toBe(true);
    expect(existsSync(resolve(publicDir, "icons/codex-mono-128.png"))).toBe(true);
  });

  test("ships Chrome-supported extension locale folders with complete manifest messages", () => {
    const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public");

    for (const locale of CHROME_WEB_STORE_LOCALES) {
      const messagesPath = resolve(publicDir, "_locales", locale, "messages.json");
      expect(existsSync(messagesPath), locale).toBe(true);

      const messages = JSON.parse(readFileSync(messagesPath, "utf8")) as Record<
        string,
        { message?: string; description?: string }
      >;
      for (const key of REQUIRED_CHROME_MESSAGE_KEYS) {
        expect(messages[key]?.message?.trim(), `${locale}:${key}`).toBeTruthy();
      }
    }
  });

  test("generates every localized message referenced by the manifest", async () => {
    const manifestPath = resolve(dirname(fileURLToPath(import.meta.url)), "../public/manifest.json");
    const manifestSource = readFileSync(manifestPath, "utf8");
    const referencedKeys = Array.from(manifestSource.matchAll(/__MSG_([A-Za-z0-9_]+)__/gu), (match) => match[1]);
    const { buildChromeLocaleMessages } = await import("../../../scripts/extension-locales.mjs");
    const generatedMessages = buildChromeLocaleMessages("en") as Record<string, { message?: string }>;

    for (const key of referencedKeys) {
      expect(generatedMessages[key]?.message?.trim(), key).toBeTruthy();
    }
  });
});
