import { describe, expect, test } from "vitest";

import {
  clampMentionOptionIndex,
  extractMentionQuery,
  getNextMentionOptionIndex,
  isMentionOptionArrowKey,
  listMentionOptions,
} from "../src/sidepanel/mentions.js";

describe("mention helpers", () => {
  test("extracts the active @query from the composer", () => {
    expect(extractMentionQuery("summarize @his")).toBe("his");
    expect(extractMentionQuery("summarize this")).toBeNull();
  });

  test("lists mention options filtered by query prefix", () => {
    expect(listMentionOptions("im").map((option) => option.id)).toEqual([]);
    expect(listMentionOptions("his").map((option) => option.id)).toEqual([]);
    expect(listMentionOptions("tab").map((option) => option.id)).toEqual(["context:open-tabs"]);
    expect(listMentionOptions("").map((option) => option.id)).toEqual(["context:open-tabs"]);
  });

  test("moves keyboard selection through mention options with wrapping", () => {
    expect(getNextMentionOptionIndex(0, 3, "down")).toBe(1);
    expect(getNextMentionOptionIndex(2, 3, "down")).toBe(0);
    expect(getNextMentionOptionIndex(2, 3, "up")).toBe(1);
    expect(getNextMentionOptionIndex(0, 3, "up")).toBe(2);
  });

  test("clamps mention keyboard selection to the available options", () => {
    expect(clampMentionOptionIndex(99, 3)).toBe(2);
    expect(clampMentionOptionIndex(-10, 3)).toBe(0);
    expect(clampMentionOptionIndex(0, 0)).toBe(0);
  });

  test("recognizes mention keyboard navigation keys", () => {
    expect(isMentionOptionArrowKey("ArrowDown")).toBe(true);
    expect(isMentionOptionArrowKey("ArrowUp")).toBe(true);
    expect(isMentionOptionArrowKey("ArrowLeft")).toBe(false);
    expect(isMentionOptionArrowKey("Enter")).toBe(false);
  });

  test("exposes apps, app-server plugins, and skills as distinct searchable @mentions", () => {
    const catalog = {
      apps: [
        {
          id: "github-app",
          name: "GitHub App",
          description: "Connected app",
          path: "app://github-app",
          token: "$github-app",
          isAccessible: true,
          isEnabled: true,
        },
      ],
      skills: [
        {
          id: "/tmp/skill/SKILL.md#git-review",
          name: "git-review",
          description: "Review git changes",
          path: "/tmp/skill/SKILL.md",
          scope: "repo",
          cwd: "/tmp/project",
          token: "$git-review",
        },
      ],
      plugins: [
        {
          id: "github@openai-curated",
          name: "GitHub",
          description: "Triage PRs, issues, CI, and publish flows",
          marketplaceName: "openai-curated",
          path: "plugin://github@openai-curated",
          token: "$github",
          installed: true,
          enabled: true,
          iconUrl: "https://example.com/github.png",
          capabilities: ["repositories"],
        },
        {
          id: "gmail@openai-curated",
          name: "Gmail",
          description: "Read and manage Gmail",
          marketplaceName: "openai-curated",
          path: "plugin://gmail@openai-curated",
          token: "$gmail",
          installed: false,
          enabled: true,
          capabilities: ["mail"],
        },
      ],
    } as const;

    expect(listMentionOptions("", "en", catalog).map((option) => option.id)).toEqual(["context:open-tabs"]);

    const result = listMentionOptions("git", "en", {
      ...catalog,
    });

    expect(result).toEqual([
      {
        id: "app:github-app",
        kind: "app",
        label: "GitHub App",
        description: "Connected app",
        structuredInput: {
          id: "github-app",
          type: "mention",
          name: "GitHub App",
          path: "app://github-app",
          token: "$github-app",
          description: "Connected app",
        },
      },
      {
        id: "plugin:github@openai-curated",
        kind: "plugin",
        label: "GitHub",
        description: "Triage PRs, issues, CI, and publish flows",
        structuredInput: {
          id: "github@openai-curated",
          type: "mention",
          name: "GitHub",
          path: "plugin://github@openai-curated",
          token: "$github",
          description: "Triage PRs, issues, CI, and publish flows",
          iconUrl: "https://example.com/github.png",
        },
      },
      {
        id: "skill:/tmp/skill/SKILL.md#git-review",
        kind: "skill",
        label: "git-review",
        description: "Review git changes",
        structuredInput: {
          id: "/tmp/skill/SKILL.md#git-review",
          type: "skill",
          name: "git-review",
          path: "/tmp/skill/SKILL.md",
          token: "$git-review",
          description: "Review git changes",
        },
      },
    ]);
  });

  test("keeps unavailable app and plugin mentions out while still allowing matching skills", () => {
    const catalog = {
      apps: [
        {
          id: "connector_gmail",
          name: "Gmail",
          description: "Read and manage Gmail",
          path: "app://connector_gmail",
          token: "$gmail",
          isAccessible: false,
          isEnabled: true,
        },
      ],
      skills: [
        {
          id: "/tmp/plugins/gmail/SKILL.md#gmail",
          name: "gmail",
          description: "Gmail skill",
          path: "/tmp/plugins/gmail/SKILL.md",
          scope: "user",
          cwd: "/tmp/project",
          token: "$gmail",
        },
      ],
      plugins: [
        {
          id: "gmail@openai-curated",
          name: "Gmail",
          description: "Read and manage Gmail",
          marketplaceName: "openai-curated",
          path: "plugin://gmail@openai-curated",
          token: "$gmail",
          installed: true,
          enabled: true,
          capabilities: ["mail"],
        },
      ],
    } as const;

    expect(listMentionOptions("gmail", "en", catalog).map((option) => option.kind)).toEqual(["skill"]);
  });

  test("hides app-backed plugin mentions when the companion app is not accessible", () => {
    const catalog = {
      apps: [
        {
          id: "connector_gmail",
          name: "Gmail",
          description: "Read and manage Gmail",
          path: "app://connector_gmail",
          token: "$gmail",
          isAccessible: false,
          isEnabled: true,
        },
      ],
      plugins: [
        {
          id: "gmail@openai-curated",
          name: "Gmail",
          description: "Read and manage Gmail",
          marketplaceName: "openai-curated",
          path: "plugin://gmail@openai-curated",
          token: "$gmail",
          installed: true,
          enabled: true,
          capabilities: ["mail"],
        },
      ],
    } as const;

    expect(listMentionOptions("gmail", "en", catalog)).toEqual([]);
  });
});
