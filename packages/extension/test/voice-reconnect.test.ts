import { describe, expect, test } from "vitest";

import { shouldAutoReconnectVoice } from "../src/sidepanel/voice-reconnect.js";

describe("voice reconnect policy", () => {
  test("reconnects unexpected realtime drops while under the retry limit", () => {
    expect(
      shouldAutoReconnectVoice({
        wasActive: true,
        requestedStop: false,
        attemptCount: 0,
        maxAttempts: 2,
        reason: "network closed",
      }),
    ).toBe(true);
  });

  test("does not reconnect user stops, terminal auth errors, or exhausted retries", () => {
    expect(
      shouldAutoReconnectVoice({
        wasActive: true,
        requestedStop: true,
        attemptCount: 0,
        maxAttempts: 2,
        reason: null,
      }),
    ).toBe(false);
    expect(
      shouldAutoReconnectVoice({
        wasActive: true,
        requestedStop: false,
        attemptCount: 0,
        maxAttempts: 2,
        reason: "Live voice requires signing in to Codex.",
      }),
    ).toBe(false);
    expect(
      shouldAutoReconnectVoice({
        wasActive: true,
        requestedStop: false,
        attemptCount: 2,
        maxAttempts: 2,
        reason: "network closed",
      }),
    ).toBe(false);
  });

  test("does not reconnect Codex realtime backend entitlement or rollout failures", () => {
    for (const reason of [
      "thread 019dc490 does not support realtime conversation",
      'unexpected status 404 Not Found: {"detail":"Not Found"}, url: https://chatgpt.com/backend-api/codex/realtime/calls',
      "failed to connect realtime websocket: HTTP error: 403 Forbidden",
      "Failed to update the voice session.",
    ]) {
      expect(
        shouldAutoReconnectVoice({
          wasActive: true,
          requestedStop: false,
          attemptCount: 0,
          maxAttempts: 2,
          reason,
        }),
      ).toBe(false);
    }
  });
});
