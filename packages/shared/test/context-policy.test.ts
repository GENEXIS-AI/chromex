import { describe, expect, test } from "vitest";

import {
  determineReadStrategy,
  inferActionCards,
  normalizePageContext,
} from "../src/index.js";

describe("determineReadStrategy", () => {
  test("uses dom for text-heavy article pages", () => {
    const strategy = determineReadStrategy({
      url: "https://example.com/article",
      textLength: 4200,
      imageCount: 2,
      hasCanvas: false,
      hasVideo: false,
      hasDenseInteractiveUi: false,
      adapterMatched: false,
    });

    expect(strategy).toBe("dom");
  });

  test("uses hybrid for video-heavy pages", () => {
    const strategy = determineReadStrategy({
      url: "https://www.youtube.com/watch?v=abc",
      textLength: 400,
      imageCount: 5,
      hasCanvas: false,
      hasVideo: true,
      hasDenseInteractiveUi: true,
      adapterMatched: false,
    });

    expect(strategy).toBe("hybrid");
  });

  test("prefers adapter when a supported site matches", () => {
    const strategy = determineReadStrategy({
      url: "https://www.youtube.com/watch?v=abc",
      textLength: 1200,
      imageCount: 3,
      hasCanvas: false,
      hasVideo: true,
      hasDenseInteractiveUi: false,
      adapterMatched: true,
    });

    expect(strategy).toBe("adapter");
  });
});

describe("normalizePageContext", () => {
  test("compresses raw page capture into a bounded envelope", () => {
    const envelope = normalizePageContext({
      metadata: {
        url: "https://example.com/story",
        title: "Example Story",
        domain: "example.com",
      },
      selectedText: "Important quote",
      bodyText: `${"This is an article sentence. ".repeat(120)}\nSecond paragraph.`,
      images: [
        { url: "https://example.com/hero.jpg", alt: "Hero", width: 1200, height: 630 },
      ],
      screenshotRef: "capture://visible-tab",
      adapterPayload: null,
      privacyFlags: {
        containsSensitiveFormData: false,
        userConsentedToHistory: false,
      },
    });

    expect(envelope.metadata.title).toBe("Example Story");
    expect(envelope.selectionText).toBe("Important quote");
    expect(envelope.domSummary.length).toBeLessThanOrEqual(240_000);
    expect(envelope.visionAssets[0]?.ref).toBe("capture://visible-tab");
  });

  test("preserves long DOM summaries for document-heavy pages", () => {
    const longText = "Long article paragraph with useful evidence. ".repeat(2600);
    const envelope = normalizePageContext({
      metadata: {
        url: "https://example.com/long-read",
        title: "Long Read",
        domain: "example.com",
      },
      selectedText: "",
      bodyText: longText,
      images: [],
      adapterPayload: null,
      privacyFlags: {
        containsSensitiveFormData: false,
        userConsentedToHistory: false,
      },
    });

    expect(envelope.domSummary.length).toBeGreaterThan(90_000);
    expect(envelope.domSummary.length).toBeLessThanOrEqual(240_000);
  });

  test("preserves DOM image natural dimensions in vision assets", () => {
    const envelope = normalizePageContext({
      metadata: {
        url: "https://example.com/gallery",
        title: "Gallery",
        domain: "example.com",
      },
      selectedText: "",
      bodyText: "Gallery",
      images: [
        {
          url: "https://example.com/photo.webp",
          naturalWidth: 1440,
          naturalHeight: 960,
        },
      ],
      adapterPayload: null,
      privacyFlags: {
        containsSensitiveFormData: false,
        userConsentedToHistory: false,
      },
    });

    expect(envelope.visionAssets[0]).toMatchObject({
      ref: "https://example.com/photo.webp",
      width: 1440,
      height: 960,
    });
  });
});

describe("inferActionCards", () => {
  test("suggests youtube actions for adapter-backed contexts", () => {
    const cards = inferActionCards({
      readStrategy: "adapter",
      adapterActions: [
        "summarize-video",
        "summarize-current-timestamp",
        "draft-blog-post",
      ],
      availableSources: ["current-page", "image"],
    });

    expect(cards.map((card) => card.id)).toEqual([
      "summarize-video",
      "summarize-current-timestamp",
      "draft-blog-post",
    ]);
  });

  test("adds YouTube-specific suggested questions from adapter payload", () => {
    const cards = inferActionCards({
      readStrategy: "adapter",
      adapterActions: ["summarize-video", "summarize-current-timestamp", "draft-blog-post"],
      availableSources: ["current-page", "image"],
      adapterPayload: {
        platform: "youtube",
        title: "Chromex Demo",
        channel: "OpenAI Dev",
        currentTimeSeconds: 184,
        transcriptAvailable: true,
        chapterTitles: ["Intro", "Architecture", "Demo"],
      },
      locale: "ko-KR",
    });

    expect(cards.map((card) => card.id)).toEqual([
      "youtube-summary-question",
      "youtube-current-moment-question",
      "youtube-chapter-notes-question",
      "youtube-blog-draft-question",
      "summarize-video",
      "summarize-current-timestamp",
    ]);
    expect(cards[0]?.title).toBe("Summarize video");
    expect(cards[0]?.prompt).toContain("Chromex Demo");
    expect(cards[1]?.prompt).toContain("03:04");
  });
});
