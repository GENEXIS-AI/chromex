import { describe, expect, test } from "vitest";

import {
  createUserProfileTemplate,
  MAX_PROFILE_SYSTEM_PROMPT_LENGTH,
  normalizeStoredProfiles,
} from "../src/profile-templates.js";

describe("profile templates", () => {
  test("creates a stable custom profile from user input", () => {
    const profile = createUserProfileTemplate({
      name: "Product Manager",
      systemPrompt: "Answer with product tradeoffs.",
      visual: {
        color: "#60a5fa",
        icon: "briefcase",
      },
      suggestedPrompts: ["Summarize this page", "Draft a PRD", "Find risks", "Ignored fourth"],
      existingIds: ["default"],
    });

    expect(profile).toMatchObject({
      id: "custom-product-manager",
      name: "Product Manager",
      systemPrompt: "Answer with product tradeoffs.",
      preferredActions: [],
      adapterHints: [],
      visual: {
        color: "#60a5fa",
        icon: "briefcase",
      },
      suggestedPrompts: ["Summarize this page", "Draft a PRD", "Find risks"],
    });
    expect(profile.defaultContextPolicy.attachCurrentPageByDefault).toBe(false);
  });

  test("deduplicates custom profile ids when a slug already exists", () => {
    const profile = createUserProfileTemplate({
      name: "Product Manager",
      existingIds: ["custom-product-manager", "custom-product-manager-2"],
    });

    expect(profile.id).toBe("custom-product-manager-3");
  });

  test("allows profile system instructions up to 16000 characters", () => {
    const profile = createUserProfileTemplate({
      name: "Long instructions",
      systemPrompt: "가".repeat(MAX_PROFILE_SYSTEM_PROMPT_LENGTH),
    });

    expect(profile.systemPrompt).toHaveLength(MAX_PROFILE_SYSTEM_PROMPT_LENGTH);
  });

  test("trims profile system instructions beyond 16000 characters before storage", () => {
    const profile = createUserProfileTemplate({
      name: "Too long",
      systemPrompt: `${"A".repeat(MAX_PROFILE_SYSTEM_PROMPT_LENGTH)}EXTRA`,
    });

    expect(profile.systemPrompt).toHaveLength(MAX_PROFILE_SYSTEM_PROMPT_LENGTH);
    expect(profile.systemPrompt.endsWith("EXTRA")).toBe(false);
  });

  test("normalizes stored profiles and drops invalid entries", () => {
    const profiles = normalizeStoredProfiles([
      createUserProfileTemplate({ name: "  PM  ", systemPrompt: "  concise  " }),
      {
        id: "",
        name: "",
        systemPrompt: "",
        defaultContextPolicy: {
          attachCurrentPageByDefault: true,
          allowedReadStrategies: ["dom"],
        },
        allowedSources: [],
        preferredActions: [],
        adapterHints: [],
      },
    ]);

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      id: "custom-pm",
      name: "PM",
      systemPrompt: "concise",
    });
  });

  test("normalizes custom profile visual metadata and suggested prompts", () => {
    const [profile] = normalizeStoredProfiles([
      {
        id: "custom-visual",
        name: "Visual",
        systemPrompt: "",
        defaultContextPolicy: {
          attachCurrentPageByDefault: true,
          allowedReadStrategies: ["dom"],
        },
        allowedSources: ["current-page"],
        preferredActions: [],
        adapterHints: [],
        visual: {
          color: "not-a-color",
          icon: "../bad",
          imageDataUrl: "javascript:alert(1)",
        },
        suggestedPrompts: ["  One  ", "", "Two", "Two", "Three", "Four"],
      },
    ]);

    expect(profile?.visual).toEqual({
      color: "#8b5cf6",
      icon: "spark",
    });
    expect(profile?.suggestedPrompts).toEqual(["One", "Two", "Three"]);
  });
});
