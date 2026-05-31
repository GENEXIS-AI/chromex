import { describe, expect, test } from "vitest";

import { createVoiceSessionContextPrompt } from "../src/background/voice-context.js";

describe("voice context prompt", () => {
  test("summarizes current page DOM and visible screen metadata for realtime voice", () => {
    const prompt = createVoiceSessionContextPrompt({
      readStrategy: "hybrid",
      envelope: {
        metadata: {
          title: "Launch notes",
          url: "https://example.com/news",
          domain: "example.com",
        },
        selectionText: "Selected paragraph",
        domSummary: "This article explains the current product launch and pricing details.",
        visionAssets: [
          { kind: "screenshot", ref: "data:image/png;base64,abc" },
          { kind: "page-image", ref: "https://example.com/hero.png", originUrl: "https://example.com/hero.png" },
        ],
        adapterPayload: { kind: "article", author: "Ada" },
        privacyFlags: {
          containsSensitiveFormData: false,
          userConsentedToHistory: false,
        },
      },
    });

    expect(prompt).toContain("LIVE VOICE BROWSER CONTEXT");
    expect(prompt).toContain("answer directly from the provided evidence");
    expect(prompt).toContain("Do not promise a later follow-up");
    expect(prompt).toContain("Title: Launch notes");
    expect(prompt).toContain("Page Text Summary: This article explains");
    expect(prompt).toContain("Visible Screen: screenshot captured for this session");
    expect(prompt).toContain("Page Images: https://example.com/hero.png");
    expect(prompt).toContain("Selected paragraph");
    expect(prompt).not.toContain("data:image/png;base64,abc");
  });
});
