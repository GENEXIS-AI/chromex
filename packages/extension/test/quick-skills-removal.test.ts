import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { listSkillOptions, listSlashCommandOptions } from "../src/sidepanel/skills.js";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");

describe("quick skill removal", () => {
  test("does not expose local quick skills as slash command or skill options", () => {
    const customSkill = {
      id: "custom-shortcut",
      name: "Customer Reply",
      prompt: "Draft a customer reply.",
      description: "Saved quick skill",
    };

    expect(listSkillOptions("reply", [customSkill])).toEqual([]);
    expect(
      listSlashCommandOptions(
        "reply",
        [customSkill],
        [
          {
            id: "support",
            name: "Customer Support",
            systemPrompt: "",
            defaultContextPolicy: {
              attachCurrentPageByDefault: false,
              allowedReadStrategies: ["dom"],
            },
            allowedSources: [],
            preferredActions: [],
            adapterHints: [],
          },
        ],
        "en",
        "default",
      )
        .filter((option) => option.kind !== "create-profile")
        .map((option) => option.kind),
    ).toEqual([]);
  });

  test("does not render legacy quick skill save or selection handlers", () => {
    expect(sidepanelSource).not.toContain("#save-skill");
    expect(sidepanelSource).not.toContain("[data-skill-id]");
    expect(sidepanelSource).not.toContain('"skill-name"');
    expect(sidepanelSource).not.toContain("data-quick-system-action");
  });
});
