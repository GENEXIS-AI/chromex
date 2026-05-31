import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");
const storageSource = readFileSync(resolve(process.cwd(), "src/background/storage.ts"), "utf8");
const typesSource = readFileSync(resolve(process.cwd(), "src/types.ts"), "utf8");

function extractBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1) {
    return "";
  }
  return source.slice(startIndex, endIndex);
}

describe("model settings persistence", () => {
  test("persists model, reasoning effort, and service tier in extension storage", () => {
    expect(storageSource).toContain("selectedModel: \"codex.sidepanel.selectedModel\"");
    expect(storageSource).toContain("selectedReasoningEffort: \"codex.sidepanel.selectedReasoningEffort\"");
    expect(storageSource).toContain("selectedServiceTier: \"codex.sidepanel.selectedServiceTier\"");
    expect(storageSource).toContain("function getSelectedReasoningEffort");
    expect(storageSource).toContain("function setSelectedReasoningEffort");
    expect(storageSource).toContain("function getSelectedServiceTier");
    expect(storageSource).toContain("function setSelectedServiceTier");
  });

  test("restores selected model controls during ui initialization", () => {
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

    expect(typesSource).toContain("selectedReasoningEffort: string;");
    expect(typesSource).toContain("selectedServiceTier: string;");
    expect(ensureStateLoaded).toContain("getSelectedReasoningEffort");
    expect(ensureStateLoaded).toContain("getSelectedServiceTier");
    expect(buildUiInitPayload).toContain("selectedReasoningEffort: state.selectedReasoningEffort");
    expect(buildUiInitPayload).toContain("selectedServiceTier: state.selectedServiceTier");
    expect(ensureStateLoaded).not.toContain("state.selectedModel = currentConversation.model");
    expect(buildUiInitPayload).not.toContain("currentConversation.model ?? state.selectedModel");
  });

  test("model control changes are sent to the background for persistence", () => {
    const attachEventListeners = extractBetween(
      sidepanelSource,
      "function bindEvents",
      "function ensureTrailingComposerToken",
    );

    expect(attachEventListeners).toContain("persistSelectedModelControls");
    expect(attachEventListeners).toContain("state.selectedReasoningEffort = normalizeReasoningEffort");
    expect(attachEventListeners).toContain("state.selectedServiceTier = normalizeServiceTier");
  });

  test("saved conversations do not overwrite the user's global selected model on hydrate", () => {
    const hydrateConversation = extractBetween(
      sidepanelSource,
      "function hydrateConversation",
      "function getSelectedModelOption",
    );

    expect(hydrateConversation).not.toContain("state.selectedModel = normalized.model");
  });
});
