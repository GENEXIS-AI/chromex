import { describe, expect, test } from "vitest";

import {
  DEFAULT_PROFILE_ID,
  normalizeSelectedProfileIdForProfiles,
  resolveComposerProfileSelection,
} from "../src/sidepanel/profile-selection.js";

const profiles = [
  {
    id: "default",
    name: "Default",
    systemPrompt: "",
    defaultContextPolicy: {
      attachCurrentPageByDefault: false,
      allowedReadStrategies: ["dom" as const],
    },
    allowedSources: [],
    preferredActions: [],
    adapterHints: [],
  },
  {
    id: "marketing",
    name: "Marketing",
    systemPrompt: "Market well.",
    defaultContextPolicy: {
      attachCurrentPageByDefault: false,
      allowedReadStrategies: ["dom" as const],
    },
    allowedSources: [],
    preferredActions: [],
    adapterHints: [],
  },
];

describe("profile selection", () => {
  test("normalizes empty or unknown profile ids to default", () => {
    expect(normalizeSelectedProfileIdForProfiles("", profiles)).toBe(DEFAULT_PROFILE_ID);
    expect(normalizeSelectedProfileIdForProfiles("missing", profiles)).toBe(DEFAULT_PROFILE_ID);
  });

  test("forces default when no visible composer profile pill is selected", () => {
    expect(
      resolveComposerProfileSelection({
        selectedProfileId: "marketing",
        profiles,
        composerCommandPills: [],
      }),
    ).toEqual({
      selectedProfileId: DEFAULT_PROFILE_ID,
      composerCommandPills: [],
    });
  });

  test("keeps a custom profile only when its composer pill is visible", () => {
    expect(
      resolveComposerProfileSelection({
        selectedProfileId: "marketing",
        profiles,
        composerCommandPills: [{ kind: "profile", id: "marketing", label: "Old label" }],
      }),
    ).toEqual({
      selectedProfileId: "marketing",
      composerCommandPills: [{ kind: "profile", id: "marketing", label: "Marketing" }],
    });
  });

  test("drops stale profile pills and falls back to default", () => {
    expect(
      resolveComposerProfileSelection({
        selectedProfileId: "deleted-profile",
        profiles,
        composerCommandPills: [{ kind: "profile", id: "deleted-profile", label: "Deleted" }],
      }),
    ).toEqual({
      selectedProfileId: DEFAULT_PROFILE_ID,
      composerCommandPills: [],
    });
  });
});
