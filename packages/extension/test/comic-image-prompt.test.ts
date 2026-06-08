import { describe, expect, test } from "vitest";

import { buildComicImagePrompt } from "../src/comic-image-prompt.js";

describe("buildComicImagePrompt", () => {
  test("allows source-sized sequential comics without hard-coding a panel count", () => {
    const prompt = buildComicImagePrompt({
      locale: "ko",
      pageTitle: "긴 분석 리포트",
      pageUrl: "https://example.com/long-report",
      userPrompt: "현재 페이지로 만화만들기",
    });

    expect(prompt).toContain("Codex app-server image generation");
    expect(prompt).toContain("Do not call a direct Image API");
    expect(prompt).toContain("Do not request a batched multi-image API response");
    expect(prompt).toContain("generate each comic image sequentially in this same Codex turn");
    expect(prompt).toContain("one representative comic image per meaningful story segment");
    expect(prompt).toContain("Do not hard-code a default panel count");
    expect(prompt).toContain("If the source has too much content for one comic image, split it into multiple comic images");
    expect(prompt).toContain("Reference chaining is required");
    expect(prompt).toContain("Comic visual system contract");
    expect(prompt).toContain("same character design, palette, panel border style");
    expect(prompt).not.toMatch(/4컷|four-panel|4-panel/iu);
  });

  test("requires content-rich comic prompts instead of generic concept art", () => {
    const prompt = buildComicImagePrompt({
      locale: "ko",
      pageTitle: "제품 분석",
      pageUrl: "https://example.com/product-analysis",
      userPrompt: "현재 페이지로 만화만들기",
    });

    expect(prompt).toContain("Do not reduce the page into generic concept-only scenes");
    expect(prompt).toContain("preserve concrete people, products, events, claims, examples, numbers, and cause-effect steps");
    expect(prompt).toContain("source detail, visual scene, explanatory caption or speech bubble, and why it matters");
    expect(prompt).toContain("convert those explanations into captions, callout boxes, mini diagrams, before/after panels");
    expect(prompt).toContain("A viewer should understand the actual source argument visually and conceptually without reading the original page");
  });
});
