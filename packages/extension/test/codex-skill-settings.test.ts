import type { CodexAppOption, CodexSkillOption, CodexStructuredInput } from "@codex-sidepanel/shared";
import { describe, expect, test } from "vitest";

import {
  createEnabledCodexSkillInputs,
  getCodexSkillRuntimeRequirement,
  mergeStructuredInputsWithEnabledCodexSkills,
  normalizeEnabledCodexSkillIds,
  toggleEnabledCodexSkillId,
} from "../src/codex-skill-settings.js";

const skills: CodexSkillOption[] = [
  {
    id: "/tmp/skills/doc/SKILL.md#doc",
    name: "doc",
    description: "Document helper",
    path: "/tmp/skills/doc/SKILL.md",
    scope: "user",
    cwd: "/tmp/project",
    token: "$doc",
  },
  {
    id: "/tmp/skills/review/SKILL.md#review",
    name: "review",
    description: "Review helper",
    path: "/tmp/skills/review/SKILL.md",
    scope: "repo",
    cwd: "/tmp/project",
    token: "$review",
  },
  {
    id: "/tmp/skills/playwright/SKILL.md#playwright",
    name: "playwright",
    description: "Playwright browser automation",
    path: "/tmp/skills/playwright/SKILL.md",
    scope: "user",
    cwd: "/tmp/project",
    token: "$playwright",
  },
  {
    id: "/tmp/skills/browser/SKILL.md#browser",
    name: "browser automation",
    description: "Puppeteer Chromium workflow",
    path: "/tmp/skills/browser/SKILL.md",
    scope: "user",
    cwd: "/tmp/project",
    token: "$browser",
  },
];

describe("Codex skill settings", () => {
  test("normalizes persisted enabled skill ids", () => {
    expect(normalizeEnabledCodexSkillIds(["doc", "", "doc", 42, "review"])).toEqual(["doc", "review"]);
    expect(normalizeEnabledCodexSkillIds(undefined)).toEqual([]);
  });

  test("toggles one Codex skill id while keeping the list stable", () => {
    expect(toggleEnabledCodexSkillId([], "doc")).toEqual(["doc"]);
    expect(toggleEnabledCodexSkillId(["doc", "review"], "doc")).toEqual(["review"]);
    expect(toggleEnabledCodexSkillId(["doc"], "")).toEqual(["doc"]);
  });

  test("creates app-server structured skill inputs only for enabled skills", () => {
    expect(createEnabledCodexSkillInputs(skills, [skills[1]!.id])).toEqual([
      {
        id: skills[1]!.id,
        type: "skill",
        name: "review",
        path: "/tmp/skills/review/SKILL.md",
        description: "Review helper",
        token: "$review",
      },
    ]);
  });

  test("detects install-required browser automation skills", () => {
    expect(getCodexSkillRuntimeRequirement(skills[0]!)).toBeNull();
    expect(getCodexSkillRuntimeRequirement(skills[2]!)).toBe("playwright");
    expect(getCodexSkillRuntimeRequirement(skills[3]!)).toBe("playwright");
  });

  test("keeps runtime-gated browser automation skills disabled until the runtime is available", () => {
    expect(createEnabledCodexSkillInputs(skills, [skills[2]!.id])).toEqual([]);
    expect(createEnabledCodexSkillInputs(skills, [skills[2]!.id], { playwrightAvailable: true })).toEqual([
      {
        id: skills[2]!.id,
        type: "skill",
        name: "playwright",
        path: "/tmp/skills/playwright/SKILL.md",
        description: "Playwright browser automation",
        token: "$playwright",
      },
    ]);
    expect(createEnabledCodexSkillInputs(skills, [skills[3]!.id])).toEqual([]);
    expect(createEnabledCodexSkillInputs(skills, [skills[3]!.id], { playwrightAvailable: true })).toEqual([
      {
        id: skills[3]!.id,
        type: "skill",
        name: "browser automation",
        path: "/tmp/skills/browser/SKILL.md",
        description: "Puppeteer Chromium workflow",
        token: "$browser",
      },
    ]);
  });

  test("preserves explicit skill inputs while adding enabled Codex skills", () => {
    const existing: CodexStructuredInput[] = [
      {
        id: "gmail",
        type: "mention",
        name: "Gmail",
        path: "app://gmail",
        token: "$gmail",
      },
      {
        id: skills[0]!.id,
        type: "skill",
        name: "doc",
        path: "/tmp/skills/doc/SKILL.md",
        token: "$doc",
      },
    ];

    expect(mergeStructuredInputsWithEnabledCodexSkills(existing, skills, [skills[1]!.id])).toEqual([
      existing[0],
      existing[1],
      {
        id: skills[1]!.id,
        type: "skill",
        name: "review",
        path: "/tmp/skills/review/SKILL.md",
        description: "Review helper",
        token: "$review",
      },
    ]);
  });

  test("keeps runtime-gated explicit skills out until their local runtime is available", () => {
    const existing: CodexStructuredInput[] = [
      {
        id: skills[2]!.id,
        type: "skill",
        name: "playwright",
        path: "/tmp/skills/playwright/SKILL.md",
        description: "Playwright browser automation",
        token: "$playwright",
      },
    ];

    expect(mergeStructuredInputsWithEnabledCodexSkills(existing, skills, [])).toEqual([]);
    expect(mergeStructuredInputsWithEnabledCodexSkills(existing, skills, [], { playwrightAvailable: true })).toEqual(existing);
  });

  test("links enabled plugin skills to matching connected app mentions", () => {
    const gmailSkill: CodexSkillOption = {
      id: "/tmp/plugins/gmail/SKILL.md#gmail",
      name: "gmail",
      description: "Manage Gmail inbox",
      path: "/tmp/plugins/gmail/SKILL.md",
      scope: "user",
      cwd: "/tmp/project",
      token: "$gmail",
    };
    const apps: CodexAppOption[] = [
      {
        id: "gmail",
        name: "Gmail",
        description: "Read and manage Gmail",
        path: "app://gmail",
        token: "$gmail",
        isAccessible: true,
        isEnabled: true,
      },
    ];

    expect(mergeStructuredInputsWithEnabledCodexSkills([], [gmailSkill], [gmailSkill.id], {}, apps)).toEqual([
      {
        id: "gmail",
        type: "mention",
        name: "Gmail",
        path: "app://gmail",
        description: "Read and manage Gmail",
        token: "$gmail",
      },
      {
        id: gmailSkill.id,
        type: "skill",
        name: "gmail",
        path: "/tmp/plugins/gmail/SKILL.md",
        description: "Manage Gmail inbox",
        token: "$gmail",
      },
    ]);
  });
});
