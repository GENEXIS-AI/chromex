import { describe, expect, test } from "vitest";

import {
  formatReasoningEffortLabel,
  formatServiceTierLabel,
  getDefaultReasoningEffort,
  getDefaultServiceTier,
  normalizeReasoningEffort,
  normalizeServiceTier,
} from "../src/sidepanel/composer-controls.js";

describe("composer control helpers", () => {
  test("prefers the strongest Codex reasoning effort when available", () => {
    expect(getDefaultReasoningEffort(["low", "medium", "high", "xhigh"], "medium")).toBe("medium");
    expect(getDefaultReasoningEffort(["low", "medium", "high", "xhigh"])).toBe("xhigh");
    expect(getDefaultReasoningEffort(["low", "medium", "high"])).toBe("high");
  });

  test("falls back to the first model effort when no known level is available", () => {
    expect(getDefaultReasoningEffort(["custom-fast", "custom-deep"])).toBe("custom-fast");
  });

  test("normalizes missing or unsupported reasoning efforts", () => {
    expect(normalizeReasoningEffort("", ["low", "medium"], "low")).toBe("low");
    expect(normalizeReasoningEffort("missing", ["low", "medium"])).toBe("medium");
    expect(normalizeReasoningEffort("high", ["low"])).toBe("low");
    expect(normalizeReasoningEffort("high", [])).toBe("");
  });

  test("formats reasoning effort labels for the composer", () => {
    expect(formatReasoningEffortLabel("xhigh", "ko")).toBe("매우 높음");
    expect(formatReasoningEffortLabel("medium", "en")).toBe("Medium");
  });

  test("normalizes service tiers against app-server model capabilities", () => {
    expect(normalizeServiceTier("fast", ["fast"])).toBe("fast");
    expect(normalizeServiceTier("fast", [])).toBe("");
    expect(normalizeServiceTier("flex", ["fast"])).toBe("");
  });

  test("defaults to speed tier when the selected model supports it", () => {
    expect(getDefaultServiceTier(["fast"])).toBe("fast");
    expect(getDefaultServiceTier(["flex"])).toBe("");
    expect(normalizeServiceTier("", ["fast"], getDefaultServiceTier(["fast"]))).toBe("fast");
  });

  test("keeps explicit normal speed when no default tier is requested", () => {
    expect(normalizeServiceTier("", ["fast"])).toBe("");
  });

  test("formats service tier labels for the composer", () => {
    expect(formatServiceTierLabel("", "ko")).toBe("보통");
    expect(formatServiceTierLabel("fast", "ko")).toBe("속도형");
    expect(formatServiceTierLabel("flex", "en")).toBe("Flex");
  });
});
