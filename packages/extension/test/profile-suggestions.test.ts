import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
  createProfileSuggestionCards,
  getSuggestionCardSource,
  mergeProfileAndSiteSuggestionCards,
} from "../src/sidepanel/profile-suggestions.js";
import { getUiStrings } from "../src/sidepanel/i18n.js";

const marketingProfile = {
  id: "marketing-strategist",
  name: "Marketing Strategist",
  systemPrompt: "",
  defaultContextPolicy: {
    attachCurrentPageByDefault: true,
    allowedReadStrategies: ["dom" as const],
  },
  allowedSources: ["current-page" as const],
  preferredActions: ["draft-blog-post"],
  adapterHints: [],
};

describe("profile suggestions", () => {
  test("does not add profile examples for the default profile", () => {
    expect(
      createProfileSuggestionCards({
        profile: { ...marketingProfile, id: "default", name: "Default" },
        currentTab: {
          tabId: 1,
          title: "Example",
          url: "https://example.com/",
          pinned: false,
          audible: false,
        },
        locale: "ko",
      }),
    ).toEqual([]);
  });

  test("creates profile-specific examples using the current site context", () => {
    const cards = createProfileSuggestionCards({
      profile: marketingProfile,
      currentTab: {
        tabId: 2,
        title: "Launch Lessons - YouTube",
        url: "https://www.youtube.com/watch?v=demo",
        pinned: false,
        audible: false,
      },
      locale: "ko",
    });

    expect(cards.map((card) => card.title)).toContain(
      getUiStrings("ko").actionCards["profile-marketing-strategist-hooks"],
    );
    expect(cards[0]?.prompt).toContain("Launch Lessons");
    expect(cards[0]?.prompt).toContain("marketing");
    expect(cards[0]?.prompt).toContain("Answer in Korean");
  });

  test("localizes built-in profile suggestions from the UI string catalog", () => {
    const cards = createProfileSuggestionCards({
      profile: marketingProfile,
      currentTab: {
        tabId: 8,
        title: "Launch Lessons - YouTube",
        url: "https://www.youtube.com/watch?v=demo",
        pinned: false,
        audible: false,
      },
      locale: "ja",
    });

    expect(cards[0]?.title).toBe(getUiStrings("ja").actionCards["profile-marketing-strategist-hooks"]);
    expect(cards[0]?.title).not.toBe(getUiStrings("en").actionCards["profile-marketing-strategist-hooks"]);
  });

  test("prioritizes profile examples while preserving site suggestions", () => {
    const merged = mergeProfileAndSiteSuggestionCards(
      [
        {
          id: "profile-marketing-strategist-primary",
          title: "Find content hooks",
          description: "profile",
          kind: "prompt",
          prompt: "profile prompt",
        },
      ],
      [
        {
          id: "youtube-summary-question",
          title: "Summarize video",
          description: "site",
          kind: "prompt",
          prompt: "site prompt",
        },
      ],
      4,
    );

    expect(merged.map((card) => card.id)).toEqual(["profile-marketing-strategist-primary", "youtube-summary-question"]);
    expect(getSuggestionCardSource(merged[0]!)).toBe("profile");
    expect(getSuggestionCardSource(merged[1]!)).toBe("site");
  });

  test("reserves room for multiple site-specific suggestions when profile examples are present", () => {
    const merged = mergeProfileAndSiteSuggestionCards(
      [
        suggestion("profile-marketing-strategist-hooks"),
        suggestion("profile-marketing-strategist-campaigns"),
        suggestion("profile-marketing-strategist-outreach"),
      ],
      [
        suggestion("youtube-summary-question"),
        suggestion("youtube-current-moment-question"),
        suggestion("youtube-chapter-notes-question"),
      ],
      4,
    );

    expect(merged.map((card) => card.id)).toEqual([
      "profile-marketing-strategist-hooks",
      "profile-marketing-strategist-campaigns",
      "youtube-summary-question",
      "youtube-current-moment-question",
    ]);
  });

  test("uses up to three user-defined profile suggestions", () => {
    const cards = createProfileSuggestionCards({
      profile: {
        ...marketingProfile,
        suggestedPrompts: [
          "Analyze {title} on {site}",
          "Write campaign ideas",
          "Find objections",
          "Ignored",
        ],
      },
      currentTab: {
        tabId: 3,
        title: "Pricing Page",
        url: "https://example.com/pricing",
        pinned: false,
        audible: false,
      },
      locale: "en",
    });

    expect(cards).toHaveLength(3);
    expect(cards[0]?.prompt).toBe("Analyze Pricing Page on example.com Answer in English.");
  });

  test("creates three built-in examples for expanded professional profiles", () => {
    const cards = createProfileSuggestionCards({
      profile: {
        ...marketingProfile,
        id: "product-manager",
        name: "Product Manager",
      },
      currentTab: {
        tabId: 4,
        title: "Feature Request",
        url: "https://example.com/feature",
        pinned: false,
        audible: false,
      },
      locale: "en",
    });

    expect(cards.map((card) => card.title)).toEqual([
      getUiStrings("en").actionCards["profile-product-manager-prd"],
      getUiStrings("en").actionCards["profile-product-manager-opportunity"],
      getUiStrings("en").actionCards["profile-product-manager-roadmap"],
    ]);
  });

  test("creates metacognitive critique examples with safety-oriented labels", () => {
    const roastCards = createProfileSuggestionCards({
      profile: {
        ...marketingProfile,
        id: "roast-coach",
        name: "Roast Coach",
      },
      currentTab: {
        tabId: 5,
        title: "Launch Post",
        url: "https://example.com/post",
        pinned: false,
        audible: false,
      },
      locale: "ko",
    });
    const harshCards = createProfileSuggestionCards({
      profile: {
        ...marketingProfile,
        id: "harsh-comment-simulator",
        name: "Harsh Comment Simulator",
      },
      currentTab: {
        tabId: 6,
        title: "Product Announcement",
        url: "https://example.com/announce",
        pinned: false,
        audible: false,
      },
      locale: "ko",
    });

    expect(roastCards.map((card) => card.title)).toContain(
      getUiStrings("ko").actionCards["profile-roast-coach-roast"],
    );
    expect(roastCards.some((card) => card.prompt?.includes("actionable improvements"))).toBe(true);
    expect(harshCards.map((card) => card.title)).toContain(
      getUiStrings("ko").actionCards["profile-harsh-comment-simulator-comments"],
    );
    expect(harshCards[0]?.prompt).toContain("legitimate concern");
  });

  test("creates slide-making examples that request sequential same-turn images", () => {
    const cards = createProfileSuggestionCards({
      profile: {
        ...marketingProfile,
        id: "slide-maker",
        name: "Slide Production Expert",
      },
      currentTab: {
        tabId: 7,
        title: "Quarterly Report",
        url: "https://example.com/report",
        pinned: false,
        audible: false,
      },
      locale: "en",
    });

    expect(cards.map((card) => card.title)).toEqual([
      getUiStrings("en").actionCards["profile-slide-maker-images"],
      getUiStrings("en").actionCards["profile-slide-maker-storyboard"],
      getUiStrings("en").actionCards["profile-slide-maker-executive"],
    ]);
    expect(cards[0]?.prompt).toContain("sequentially in this same Codex turn");
    expect(cards[0]?.prompt).toContain("meaningful parts");
    expect(cards[0]?.prompt).toContain("one representative slide image for each part");
    expect(cards[0]?.prompt).toContain("design direction");
    expect(cards[0]?.prompt).toContain("one source-grounded image prompt");
    expect(cards[0]?.prompt).toContain("previous generated slide image path");
    expect(cards[0]?.prompt).toContain("Quarterly Report");
    expect(cards[2]?.prompt).toContain("source's meaningful parts");
    expect(cards[2]?.prompt).toContain("source-part storyboard");
    expect(cards[2]?.prompt).toContain("previous slide prompt summary");
    expect(cards[2]?.prompt).toContain("Do not stop at an outline");
  });

  test("does not keep locale-specific hardcoded profile prompt packs", () => {
    const source = readFileSync(new URL("../src/sidepanel/profile-suggestions.ts", import.meta.url), "utf8");
    const disallowedKoreanPack = ["PROFILE", "PROMPTS", "KO"].join("_");
    const disallowedEnglishPack = ["PROFILE", "PROMPTS", "EN"].join("_");
    const disallowedLocalePack = ["PROFILE", "PROMPTS", "BY", "LOCALE"].join("_");
    const disallowedPackGetter = ["get", "Profile", "Prompt", "Pack"].join("");

    expect(source).not.toContain(disallowedKoreanPack);
    expect(source).not.toContain(disallowedEnglishPack);
    expect(source).not.toContain(disallowedLocalePack);
    expect(source).not.toContain(disallowedPackGetter);
    expect(source).not.toMatch(/[가-힣]/u);
  });
});

function suggestion(id: string) {
  return {
    id,
    title: id,
    description: "",
    kind: "prompt" as const,
    prompt: `${id} prompt`,
  };
}
