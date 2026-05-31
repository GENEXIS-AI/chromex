import { describe, expect, test } from "vitest";

import { estimateTextTokens, fitTextToTokenBudget, resolveDomContextBudget } from "../src/context-budget.js";

describe("context budget", () => {
  test("estimates dense multilingual scripts more conservatively than latin prose", () => {
    expect(estimateTextTokens("한국어 문장입니다. ".repeat(100))).toBeGreaterThan(
      estimateTextTokens("This is a simple English sentence. ".repeat(100)) / 2,
    );
  });

  test("reserves prompt and output room before assigning DOM tokens", () => {
    const budget = resolveDomContextBudget({
      modelId: "gpt-5.3-codex-spark",
      userMessage: "Summarize this article and keep room for a detailed answer.".repeat(80),
      contextCount: 2,
      fileAttachmentCount: 1,
    });

    expect(budget.modelContextTokens).toBe(64_000);
    expect(budget.outputReserveTokens).toBeGreaterThanOrEqual(2_000);
    expect(budget.userMessageTokens).toBeGreaterThan(100);
    expect(budget.perContextDomTokens).toBeLessThan(budget.availableDomTokens);
  });

  test("clips text by estimated token budget instead of a fixed character count", () => {
    const text = "중요한 문장입니다. ".repeat(20_000);
    const fit = fitTextToTokenBudget(text, 2_500);

    expect(fit.truncated).toBe(true);
    expect(fit.originalChars).toBe(text.trim().length);
    expect(fit.includedChars).toBeLessThan(fit.originalChars);
    expect(fit.includedTokens).toBeLessThanOrEqual(2_500);
    expect(fit.text.endsWith("…")).toBe(true);
  });
});
