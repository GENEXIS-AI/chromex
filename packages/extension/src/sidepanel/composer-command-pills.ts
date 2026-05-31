export type ComposerCommandPill = {
  kind: "profile";
  id: string;
  label: string;
};

export function upsertComposerCommandPill(
  pills: ComposerCommandPill[],
  nextPill: ComposerCommandPill,
): ComposerCommandPill[] {
  const withoutProfile = pills.filter((pill) => pill.kind !== "profile");
  return [nextPill, ...withoutProfile];
}

export function clearTransientComposerCommandPills(pills: ComposerCommandPill[]): ComposerCommandPill[] {
  return pills;
}

export function removeComposerCommandPill(pills: ComposerCommandPill[], pillId: string): ComposerCommandPill[] {
  return pills.filter((pill) => pill.id !== pillId);
}
