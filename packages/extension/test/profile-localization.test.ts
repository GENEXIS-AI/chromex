import { describe, expect, test } from "vitest";

import { listProfileTemplates, type ProfileTemplate } from "@codex-sidepanel/shared";

import { localizeBuiltinProfiles } from "../src/profile-localization.js";

describe("profile localization", () => {
  test("localizes only bundled profile display names for Korean UI", () => {
    const customProfile: ProfileTemplate = {
      id: "custom-my-team",
      name: "My Team",
      systemPrompt: "Internal team rules.",
      defaultContextPolicy: {
        attachCurrentPageByDefault: false,
        allowedReadStrategies: ["dom"],
      },
      allowedSources: ["current-page"],
      preferredActions: [],
      adapterHints: [],
    };
    const slideProfile: ProfileTemplate = {
      ...customProfile,
      id: "slide-maker",
      name: "Slide Production Expert",
    };
    const sourceProfiles = [...listProfileTemplates(), slideProfile, customProfile];
    const originalResearchPrompt = sourceProfiles.find((profile) => profile.id === "research-assistant")?.systemPrompt;

    const localized = localizeBuiltinProfiles(sourceProfiles, "ko-KR");

    expect(localized.find((profile) => profile.id === "default")?.name).toBe("기본");
    expect(localized.find((profile) => profile.id === "research-assistant")?.name).toBe("리서치 어시스턴트");
    expect(localized.find((profile) => profile.id === "marketing-strategist")?.name).toBe("마케팅 전략가");
    expect(localized.find((profile) => profile.id === "slide-maker")?.name).toBe("슬라이드 제작 전문가");
    expect(localized.find((profile) => profile.id === "custom-my-team")?.name).toBe("My Team");
    expect(localized.find((profile) => profile.id === "research-assistant")?.systemPrompt).toBe(originalResearchPrompt);
  });

  test("keeps bundled English names for non-Korean UI locales", () => {
    const localized = localizeBuiltinProfiles(listProfileTemplates(), "en-US");

    expect(localized.find((profile) => profile.id === "default")?.name).toBe("Default");
    expect(localized.find((profile) => profile.id === "teacher-mode")?.name).toBe("Teacher Mode");
    expect(localized.find((profile) => profile.id === "slide-maker")?.name).toBe("Slide Production Expert");
  });
});
