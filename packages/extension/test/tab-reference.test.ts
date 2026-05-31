import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  formatCurrentTabReferenceLabel,
  formatTabReferenceLabel,
  getTabReferenceInitial,
} from "../src/sidepanel/tab-reference.js";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");

describe("tab reference display", () => {
  test("uses recognizable site brands for compact reference chips", () => {
    expect(formatTabReferenceLabel({ title: "A very long watch title", url: "https://www.youtube.com/watch?v=abc" })).toBe(
      "YouTube",
    );
    expect(formatTabReferenceLabel({ title: "New chat", url: "https://chatgpt.com/c/123" })).toBe("ChatGPT");
  });

  test("falls back to a compact hostname and stable initial", () => {
    const label = formatTabReferenceLabel({ title: "Docs", url: "https://docs.example.com/path" });

    expect(label).toBe("docs.example.com");
    expect(getTabReferenceInitial(label)).toBe("D");
  });

  test("uses the live tab title for the current-tab composer chip", () => {
    expect(
      formatCurrentTabReferenceLabel({
        title: "ChatGPT - Google Workspace draft",
        url: "https://chatgpt.com/c/123",
      }),
    ).toBe("ChatGPT - Google Workspace draft");
  });

  test("uses a lucide web icon when a selected tab has no favicon", () => {
    expect(sidepanelSource).toContain('renderUiIcon("globe", "tab-reference-lucide-icon")');
    expect(sidepanelSource).toContain('class="tab-reference-icon fallback-web"');
    expect(sidepanelSource).toContain('class="tab-mention-icon fallback-web"');
  });
});
