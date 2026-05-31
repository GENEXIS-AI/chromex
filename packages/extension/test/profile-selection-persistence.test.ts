import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");

function extractBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1) {
    return "";
  }
  return source.slice(startIndex, endIndex);
}

describe("profile selection persistence", () => {
  test("does not silently reactivate a saved conversation profile when hydrating the side panel", () => {
    const hydrateConversation = extractBetween(
      sidepanelSource,
      "function hydrateConversation",
      "function getSelectedModelOption",
    );

    expect(hydrateConversation).not.toContain("state.selectedProfileId = normalized.profileId");
  });

  test("ui initialization keeps stored profile selection separate from the current conversation profile", () => {
    const ensureStateLoaded = extractBetween(
      backgroundSource,
      "async function ensureStateLoaded",
      "async function buildUiInitPayload",
    );
    const buildUiInitPayload = extractBetween(
      backgroundSource,
      "async function buildUiInitPayload",
      "async function handleAccountLogin",
    );

    expect(ensureStateLoaded).not.toContain("state.selectedProfileId = normalizeSelectedProfileId(currentConversation.profileId)");
    expect(buildUiInitPayload).not.toContain("state.selectedProfileId = normalizeSelectedProfileId(currentConversation.profileId)");
  });

  test("regenerate reuses the original message profile without switching the composer profile", () => {
    const replayConversationFromMessage = extractBetween(
      sidepanelSource,
      "async function replayConversationFromMessage",
      "function isSlideImageGenerationActionCard",
    );

    expect(replayConversationFromMessage).toContain("profileId: replay.profileId");
    expect(replayConversationFromMessage).not.toContain("selectProfileForComposer");
    expect(replayConversationFromMessage).not.toContain("profile.select");
  });
});
