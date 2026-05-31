import { describe, expect, test } from "vitest";

import { buildInfographicPrompt } from "../src/infographic-prompt.js";

const FORBIDDEN_FORMAT_HINTS = [
  /aspect\s*ratio/iu,
  /\blayout\b/iu,
  /\bcomposition\b/iu,
  /\bvisual structure\b/iu,
  /\bsize\b/iu,
  /\bdimensions?\b/iu,
  /\bvertical\b/iu,
  /\bportrait\b/iu,
  /\bposter\b/iu,
  /\btimeline\b/iu,
  /\bchecklist\b/iu,
  /\bconcept map\b/iu,
  /\bcomparison\b/iu,
  /\bprocess\b/iu,
  /\bsimple map\b/iu,
  /\binfographic\b/iu,
  /1024x1536/iu,
];

function expectNoFormatHints(prompt: string): void {
  for (const forbidden of FORBIDDEN_FORMAT_HINTS) {
    expect(prompt).not.toMatch(forbidden);
  }
}

describe("buildInfographicPrompt", () => {
  test("builds a simple locale-aware infographic prompt from current page data", () => {
    const prompt = buildInfographicPrompt({
      locale: "ko",
      pageTitle: "AI 시장 보고서",
      pageUrl: "https://example.com/report",
    });

    expect(prompt).toContain("Create a beautiful visual explainer image for the relevant country/culture that best explains the context of this page.");
    expect(prompt).toContain("Locale/culture: 한국어 (ko). Use this as the language, cultural, reading-flow, and visual-tone context.");
    expect(prompt).toContain("Use the attached current-page context as the source of truth.");
    expect(prompt).toContain("AI 시장 보고서");
    expect(prompt).not.toContain("gpt-image-2");
    expectNoFormatHints(prompt);
  });

  test("keeps source context separate from generation instructions", () => {
    const prompt = buildInfographicPrompt({
      locale: "en",
      pageTitle: "Quarterly revenue dashboard",
      pageUrl: "https://example.com/dashboard",
    });

    expect(prompt).toContain("Instructions:");
    expect(prompt).toContain("Source:");
    expect(prompt).toContain("Use the attached current-page context as the source of truth.");
    expect(prompt).not.toContain("<script");
    expectNoFormatHints(prompt);
  });

  test("uses content-only focus hints for known page types", () => {
    const cases = [
      {
        input: {
          locale: "ko",
          pageTitle: "State of the Claw",
          pageUrl: "https://www.youtube.com/watch?v=demo",
          adapterPayload: { platform: "youtube", currentTimeSeconds: 92, transcriptSegments: [] },
        },
        focus: "Context focus: the video's main context and takeaway.",
      },
      {
        input: {
          locale: "en",
          pageTitle: "Attention Is All You Need",
          pageUrl: "https://arxiv.org/abs/1706.03762",
          adapterPayload: { platform: "arxiv", arxivId: "1706.03762" },
        },
        focus: "Context focus: the paper's core question, contribution, and implication.",
      },
      {
        input: {
          locale: "ko",
          pageTitle: "속보 기사",
          pageUrl: "https://news.naver.com/article/001/0000000000",
          adapterPayload: { platform: "news", region: "kr" },
        },
        focus: "Context focus: what happened and why it matters.",
      },
      {
        input: {
          locale: "en",
          pageTitle: "Project workspace",
          pageUrl: "https://www.notion.so/team/project",
          adapterPayload: { platform: "notion" },
        },
        focus: "Context focus: the page's main context and most useful takeaway.",
      },
    ];

    for (const { input, focus } of cases) {
      const prompt = buildInfographicPrompt(input);
      expect(prompt).toContain(focus);
      expectNoFormatHints(prompt);
    }
  });

  test("uses the same simple country and culture request for inferred article pages", () => {
    const prompt = buildInfographicPrompt({
      locale: "ko",
      pageTitle: "AI 투자 기사",
      pageUrl: "https://example-news.com/article/ai-investment",
    });

    expect(prompt).toContain("Create a beautiful visual explainer image for the relevant country/culture that best explains the context of this page.");
    expect(prompt).toContain("Context focus: what happened and why it matters.");
    expectNoFormatHints(prompt);
  });
});
