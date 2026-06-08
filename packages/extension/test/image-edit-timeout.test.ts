import { describe, expect, test } from "vitest";

import {
  buildImageEditTimeoutMessage,
  buildImageGenerationWorkflowTimeoutMessage,
  IMAGE_EDIT_TIMEOUT_MS,
  IMAGE_GENERATION_WORKFLOW_TIMEOUT_MS,
} from "../src/background/image-edit-timeout.js";
import { getUiStrings } from "../src/sidepanel/i18n.js";
import { listSupportedUiLanguageOptions } from "../src/ui-language.js";

describe("image edit timeout policy", () => {
  test("waits up to 20 minutes for long Codex image generation jobs", () => {
    expect(IMAGE_EDIT_TIMEOUT_MS).toBe(20 * 60 * 1000);
  });

  test("allows sequential multi-image generation to run longer than a single image edit", () => {
    expect(IMAGE_GENERATION_WORKFLOW_TIMEOUT_MS).toBeGreaterThan(IMAGE_EDIT_TIMEOUT_MS);
    expect(IMAGE_GENERATION_WORKFLOW_TIMEOUT_MS).toBe(60 * 60 * 1000);
    expect(buildImageGenerationWorkflowTimeoutMessage()).toContain("60 minutes");
    expect(buildImageGenerationWorkflowTimeoutMessage("ko")).toContain("60분");
  });

  test("explains the 20 minute image generation timeout to the user", () => {
    expect(buildImageEditTimeoutMessage()).toContain("20 minutes");
    expect(buildImageEditTimeoutMessage()).not.toContain("free accounts");
    expect(buildImageEditTimeoutMessage(getUiStrings("ko").errors.imageEditTimeout)).toContain("20분");
    expect(buildImageEditTimeoutMessage(getUiStrings("ko").errors.imageEditTimeout)).not.toContain("무료 계정");
    expect(buildImageEditTimeoutMessage(getUiStrings("ja").errors.imageEditTimeout)).not.toBe(
      buildImageEditTimeoutMessage(),
    );
  });

  test("uses the full UI language catalog for image edit failures", () => {
    const locales = listSupportedUiLanguageOptions()
      .map((option) => option.locale)
      .filter((locale) => locale !== "auto");

    for (const locale of locales) {
      const strings = getUiStrings(locale);
      const message = buildImageEditTimeoutMessage(strings.errors.imageEditTimeout);
      expect(strings.errors.imageEdit, locale).toBeTruthy();
      expect(message, locale).toBeTruthy();
      expect(message, locale).not.toMatch(/free accounts|무료 계정/iu);
    }

    expect(getUiStrings("fr").errors.imageEdit).not.toBe(getUiStrings("en").errors.imageEdit);
    expect(getUiStrings("ja").errors.imageEdit).not.toBe(getUiStrings("en").errors.imageEdit);
    expect(buildImageEditTimeoutMessage(getUiStrings("fr").errors.imageEditTimeout)).not.toBe(
      buildImageEditTimeoutMessage(),
    );
    expect(buildImageEditTimeoutMessage(getUiStrings("ja").errors.imageEditTimeout)).not.toBe(
      buildImageEditTimeoutMessage(),
    );
  });
});
