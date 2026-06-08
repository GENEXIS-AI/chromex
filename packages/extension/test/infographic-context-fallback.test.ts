import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");

describe("infographic context fallback", () => {
  test("falls back from sparse DOM context to hybrid visible-screen context", () => {
    expect(backgroundSource).toContain("collectInfographicPageContext");
    expect(backgroundSource).toContain('collectCurrentPageContext("dom")');
    expect(backgroundSource).toContain('collectCurrentPageContext("hybrid")');
    expect(backgroundSource).toContain("shouldFallbackToVisionForInfographic");
    expect(backgroundSource).toContain("collectVisibleScreenOnlyInfographicContext");
    expect(backgroundSource).toContain("collectVisibleScreenFallbackContext");
    expect(backgroundSource).toContain("extension.page_context.dom_failed");
    expect(backgroundSource).toContain("createMinimalVisibleScreenContext");
    expect(backgroundSource).toContain("extension.infographic_context.dom_failed");
    expect(backgroundSource).toContain("extension.infographic_context.hybrid_fallback_failed");
  });

  test("reuses the same fallback context path for slide image generation", () => {
    const firstUse = backgroundSource.indexOf("const context = await collectInfographicPageContext();");
    const secondUse = backgroundSource.indexOf("const context = await collectInfographicPageContext();", firstUse + 1);

    expect(firstUse).toBeGreaterThanOrEqual(0);
    expect(secondUse).toBeGreaterThan(firstUse);
  });
});
