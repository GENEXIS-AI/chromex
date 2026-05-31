import { describe, expect, test } from "vitest";

import { buildSlideDeckImagePrompt } from "../src/slide-deck-image-prompt.js";

describe("buildSlideDeckImagePrompt", () => {
  test("routes slide generation through sequential Codex image tool calls, not a batched API request", () => {
    const prompt = buildSlideDeckImagePrompt({
      locale: "en",
      pageTitle: "Quarterly growth report",
      pageUrl: "https://example.com/report",
      userPrompt: "Make 4 board-ready slide images.",
    });

    expect(prompt).toContain("Codex app-server image generation");
    expect(prompt).toContain("Do not call a direct Image API");
    expect(prompt).toContain("Do not request a batched multi-image API response");
    expect(prompt).toContain("generate each slide image sequentially in this same Codex turn");
    expect(prompt).toContain("Each slide must be a separate image-generation tool call");
    expect(prompt).toContain("segmenting the source into meaningful parts or sections");
    expect(prompt).toContain("one representative slide per meaningful part");
    expect(prompt).toContain("Do not hard-code a default slide count");
    expect(prompt).toContain("Reference chaining is required");
    expect(prompt).toContain("Previous slide prompt summary");
    expect(prompt).toContain("If the previous generated image cannot be attached");
    expect(prompt).toContain("Deck visual system contract");
    expect(prompt).toContain("same palette, typography, grid, spacing, component shapes");
    expect(prompt).toContain("Make 4 board-ready slide images.");
  });
});
