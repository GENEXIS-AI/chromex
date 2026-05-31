import { describe, expect, test } from "vitest";

import { extractSlashQuery, listSlashCommandOptions } from "../src/sidepanel/skills.js";

describe("skills", () => {
  test("extracts a slash query from the composer", () => {
    expect(extractSlashQuery("/summ")).toBe("summ");
    expect(extractSlashQuery("please /youtube")).toBe("youtube");
    expect(extractSlashQuery("/요약")).toBe("요약");
    expect(extractSlashQuery("plain text")).toBeNull();
  });

  test("lists profile commands and a direct profile creation action for slash invocation", () => {
    const results = listSlashCommandOptions(
      "legal",
      [
        {
          id: "custom-skill",
          name: "Legal Shortcut",
          prompt: "Draft a legal summary.",
          description: "Shortcut",
        },
      ],
      [
        {
          id: "legal-reviewer",
          name: "Legal Reviewer",
          systemPrompt: "Review legal context.",
          defaultContextPolicy: {
            attachCurrentPageByDefault: true,
            allowedReadStrategies: ["dom"],
          },
          allowedSources: ["current-page"],
          preferredActions: [],
          adapterHints: [],
        },
      ],
      "en",
      "default",
    );

    expect(results[0]).toMatchObject({
      id: "profile:legal-reviewer",
      kind: "profile",
      label: "Legal Reviewer",
    });
    expect(results.at(-1)).toMatchObject({
      id: "create-profile",
      kind: "create-profile",
      label: "Create manually",
    });
  });

  test("marks the active profile in slash command options", () => {
    const results = listSlashCommandOptions(
      "",
      [],
      [
        {
          id: "default",
          name: "Default",
          systemPrompt: "",
          defaultContextPolicy: {
            attachCurrentPageByDefault: false,
            allowedReadStrategies: ["dom"],
          },
          allowedSources: [],
          preferredActions: [],
          adapterHints: [],
        },
        {
          id: "research-assistant",
          name: "Research Assistant",
          systemPrompt: "",
          defaultContextPolicy: {
            attachCurrentPageByDefault: true,
            allowedReadStrategies: ["dom"],
          },
          allowedSources: ["current-page"],
          preferredActions: [],
          adapterHints: [],
        },
      ],
      "ko",
      "default",
    );

    expect(results[0]).toMatchObject({
      id: "profile:default",
      kind: "profile",
      active: true,
      description: "",
    });
    expect(results.at(-1)).toMatchObject({
      id: "create-profile",
      kind: "create-profile",
      label: "직접 만들기",
    });
  });

  test("passes profile visual metadata to slash command options", () => {
    const results = listSlashCommandOptions(
      "designer",
      [],
      [
        {
          id: "custom-designer",
          name: "Designer",
          systemPrompt: "",
          defaultContextPolicy: {
            attachCurrentPageByDefault: false,
            allowedReadStrategies: ["dom"],
          },
          allowedSources: ["current-page"],
          preferredActions: [],
          adapterHints: [],
          visual: {
            color: "#3998f5",
            icon: "palette",
          },
        },
      ],
      "en",
      "default",
    );

    expect(results[0]).toMatchObject({
      kind: "profile",
      visual: {
        color: "#3998f5",
        icon: "palette",
      },
    });
  });

  test("does not list Codex app-server skills as slash attach commands", () => {
    const results = listSlashCommandOptions(
      "review",
      [],
      [],
      "en",
      "default",
    );

    expect(results).toEqual([
      {
        id: "create-profile",
        kind: "create-profile",
        label: "Create manually",
        description: "",
      },
    ]);
  });

  test("filters profile commands by the text after the slash", () => {
    const results = listSlashCommandOptions(
      "research",
      [
        {
          id: "custom-email",
          name: "Email Reply",
          prompt: "Draft a reply.",
          description: "Mail shortcut",
        },
      ],
      [
        {
          id: "research-assistant",
          name: "Research Assistant",
          systemPrompt: "",
          defaultContextPolicy: {
            attachCurrentPageByDefault: true,
            allowedReadStrategies: ["dom"],
          },
          allowedSources: ["current-page"],
          preferredActions: [],
          adapterHints: [],
        },
      ],
      "en",
      "default",
    );

    expect(results.filter((option) => option.kind === "profile").map((option) => option.label)).toEqual([
      "Research Assistant",
    ]);
    expect(results.some((option) => option.label === "Email Reply")).toBe(false);
    expect(results.at(-1)?.kind).toBe("create-profile");
  });
});
