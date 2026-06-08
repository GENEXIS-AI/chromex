import { describe, expect, test } from "vitest";

import { shouldOfferApiKeyFallbackForError } from "../src/sidepanel/oauth-fallback.js";
import type { UiInitPayload } from "../src/types.js";

const chatgptAccount: UiInitPayload["accountStatus"] = {
  authMode: "chatgpt",
  codexAuthenticated: true,
  multimodalAvailable: true,
  openAiApiKeyConfigured: false,
};

describe("OAuth usage fallback", () => {
  test("does not offer API-key fallback when a ChatGPT OAuth account exhausts usage", () => {
    expect(
      shouldOfferApiKeyFallbackForError({
        error: new Error("usage limit reached for this account"),
        accountStatus: chatgptAccount,
        rateLimits: null,
      }),
    ).toBe(false);
  });

  test("does not offer fallback for non-quota errors or non-OAuth accounts", () => {
    expect(
      shouldOfferApiKeyFallbackForError({
        error: new Error("thread not found"),
        accountStatus: chatgptAccount,
        rateLimits: null,
      }),
    ).toBe(false);
    expect(
      shouldOfferApiKeyFallbackForError({
        error: new Error("usage limit reached"),
        accountStatus: { ...chatgptAccount, authMode: "apikey" },
        rateLimits: null,
      }),
    ).toBe(false);
  });

  test("does not use rate-limit snapshots to trigger API-key fallback", () => {
    expect(
      shouldOfferApiKeyFallbackForError({
        error: new Error("request failed"),
        accountStatus: chatgptAccount,
        rateLimits: {
          defaultBucket: {
            limitId: "chatgpt",
            limitName: "Codex",
            planType: "plus",
            primary: {
              usedPercent: 100,
              windowDurationMins: 180,
              resetsAt: 1_800_000,
            },
            secondary: null,
          },
          buckets: [],
        },
      }),
    ).toBe(false);
  });
});
