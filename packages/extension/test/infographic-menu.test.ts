import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const source = readFileSync(resolve(__dirname, "../src/sidepanel/index.ts"), "utf8");

describe("infographic quick action UI", () => {
  test("keeps current-page quick actions in the top bar instead of the app menu", () => {
    expect(source).toContain('class="top-quick-actions"');
    expect(source).toContain('data-top-quick-action="summarize-page"');
    expect(source).toContain('data-top-quick-action="infographic"');
    expect(source).toContain('data-top-quick-action="page-comic"');
    expect(source).toContain("top-quick-summary-icon");
    expect(source).toContain("top-quick-comic-icon");
    expect(source).toContain("${renderTopQuickActions(quickInteractionLocked)}");
    expect(source).toContain('class="top-quick-separator"');
    expect(source).toContain("renderAppMenu(isPopup, false)");
    expect(source).toContain("createInfographicFromCurrentPage");
    expect(source).toContain("createComicFromCurrentPage");
    expect(source).toContain("image.infographic.start");
    expect(source).toContain('actionId === "news-infographic"');
    expect(source).not.toContain('data-menu-action="infographic"');
    expect(source).not.toContain('data-top-quick-action="infographic"><svg');
    expect(source).not.toContain('aria-hidden="true">≡</span>');
    expect(source).not.toContain("summarizeLabel");
    expect(source).not.toContain("infographicLabel");
  });

  test("does not require composer text before starting current-page infographic generation", () => {
    expect(source).toContain("canStartCurrentComposerWorkflow()");
    expect(source).toMatch(/async function createInfographicFromCurrentPage\(\): Promise<void> \{\s+if \(!canStartCurrentComposerWorkflow\(\)\)/u);
    expect(source).toMatch(/async function createComicFromCurrentPage\(\): Promise<void> \{\s+if \(!canStartCurrentComposerWorkflow\(\)\)/u);
    expect(source).toMatch(/async function createSlideImagesFromCurrentPage\(prompt: string\): Promise<void> \{\s+if \(!canStartCurrentComposerWorkflow\(\)\)/u);
  });
});
