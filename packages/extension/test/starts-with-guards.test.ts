import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const contentSource = readFileSync(resolve(process.cwd(), "src/content/index.ts"), "utf8");
const pluginConnectionSource = readFileSync(resolve(process.cwd(), "src/plugin-connection-availability.ts"), "utf8");
const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");

describe("startsWith runtime guards", () => {
  test("guards keyboard events before checking arrow key prefixes", () => {
    expect(contentSource).toContain('typeof event.key === "string"');
    expect(contentSource).toContain("key.startsWith(\"Arrow\")");
  });

  test("normalizes structured input paths before checking plugin prefixes", () => {
    expect(sidepanelSource).toContain("function getStructuredInputPath");
    expect(sidepanelSource).toContain("getStructuredInputPath(input).startsWith(\"plugin://\")");
    expect(pluginConnectionSource).toContain("function getStructuredInputPath");
    expect(pluginConnectionSource).toContain("getStructuredInputPath(input).startsWith(\"plugin://\")");
    expect(pluginConnectionSource).not.toContain("input.path.startsWith");
  });

  test("uses a locale helper for Korean UI checks instead of calling startsWith on nullable state", () => {
    expect(sidepanelSource).toContain("function isKoreanUiLocale");
    expect(sidepanelSource).not.toContain("state.uiLocale.startsWith");
  });
});
