import { describe, expect, test } from "vitest";

import {
  clearTransientComposerCommandPills,
  removeComposerCommandPill,
  upsertComposerCommandPill,
  type ComposerCommandPill,
} from "../src/sidepanel/composer-command-pills.js";

describe("composer command pills", () => {
  test("keeps only the active profile pill", () => {
    const pills: ComposerCommandPill[] = [];
    const withProfile = upsertComposerCommandPill(pills, {
      kind: "profile",
      id: "marketing",
      label: "Marketing Copilot",
    });

    expect(withProfile.map((pill) => pill.kind)).toEqual(["profile"]);
    expect(withProfile.map((pill) => pill.label)).toEqual(["Marketing Copilot"]);
  });

  test("replaces the active profile", () => {
    const pills: ComposerCommandPill[] = [
      { kind: "profile", id: "research", label: "Research" },
    ];

    expect(
      upsertComposerCommandPill(pills, {
        kind: "profile",
        id: "marketing",
        label: "Marketing Copilot",
      }),
    ).toEqual([
      { kind: "profile", id: "marketing", label: "Marketing Copilot" },
    ]);
  });

  test("clears transient command pills without dropping the profile pill", () => {
    expect(
      clearTransientComposerCommandPills([
        { kind: "profile", id: "marketing", label: "Marketing Copilot" },
      ]),
    ).toEqual([{ kind: "profile", id: "marketing", label: "Marketing Copilot" }]);
  });

  test("removes only the requested pill", () => {
    expect(
      removeComposerCommandPill(
        [
          { kind: "profile", id: "marketing", label: "Marketing Copilot" },
        ],
        "marketing",
      ),
    ).toEqual([]);
  });
});
