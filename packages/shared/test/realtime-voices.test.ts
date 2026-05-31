import { describe, expect, test } from "vitest";

import {
  CODEX_REALTIME_VOICES,
  isCodexRealtimeVoice,
  normalizeCodexRealtimeVoice,
} from "../src/realtime-voices.js";

describe("Codex realtime voices", () => {
  test("matches the app-server RealtimeVoice enum", () => {
    expect(CODEX_REALTIME_VOICES).toEqual([
      "alloy",
      "arbor",
      "ash",
      "ballad",
      "breeze",
      "cedar",
      "coral",
      "cove",
      "echo",
      "ember",
      "juniper",
      "maple",
      "marin",
      "sage",
      "shimmer",
      "sol",
      "spruce",
      "vale",
      "verse",
    ]);
  });

  test("filters unsupported browser speech voices", () => {
    expect(isCodexRealtimeVoice("sage")).toBe(true);
    expect(normalizeCodexRealtimeVoice("Samantha")).toBe("");
    expect(normalizeCodexRealtimeVoice("")).toBe("");
  });
});
