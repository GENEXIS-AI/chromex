import type { ProfileTemplate } from "@codex-sidepanel/shared";

import type { ComposerCommandPill } from "./composer-command-pills.js";

export const DEFAULT_PROFILE_ID = "default";

export function normalizeSelectedProfileIdForProfiles(
  profileId: string | null | undefined,
  profiles: ProfileTemplate[],
): string {
  const requested = profileId?.trim() ?? "";
  if (requested && profiles.some((profile) => profile.id === requested)) {
    return requested;
  }
  return profiles.some((profile) => profile.id === DEFAULT_PROFILE_ID)
    ? DEFAULT_PROFILE_ID
    : (profiles[0]?.id ?? DEFAULT_PROFILE_ID);
}

export function resolveComposerProfileSelection(input: {
  selectedProfileId: string | null | undefined;
  profiles: ProfileTemplate[];
  composerCommandPills: ComposerCommandPill[];
}): {
  selectedProfileId: string;
  composerCommandPills: ComposerCommandPill[];
} {
  const profilePill = input.composerCommandPills.find((pill) => pill.kind === "profile");
  if (!profilePill) {
    return {
      selectedProfileId: normalizeSelectedProfileIdForProfiles(DEFAULT_PROFILE_ID, input.profiles),
      composerCommandPills: input.composerCommandPills.filter((pill) => pill.kind !== "profile"),
    };
  }

  const selectedProfileId = normalizeSelectedProfileIdForProfiles(profilePill.id, input.profiles);
  if (selectedProfileId === DEFAULT_PROFILE_ID) {
    return {
      selectedProfileId,
      composerCommandPills: input.composerCommandPills.filter((pill) => pill.kind !== "profile"),
    };
  }

  const profile = input.profiles.find((candidate) => candidate.id === selectedProfileId);
  return {
    selectedProfileId,
    composerCommandPills: [
      {
        kind: "profile",
        id: selectedProfileId,
        label: profile?.name ?? profilePill.label,
      },
      ...input.composerCommandPills.filter((pill) => pill.kind !== "profile"),
    ],
  };
}
