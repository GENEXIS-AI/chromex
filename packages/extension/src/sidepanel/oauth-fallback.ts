import type { CodexRateLimits } from "@codex-sidepanel/shared";
import type { UiInitPayload } from "../types.js";

export function shouldOfferApiKeyFallbackForError(input: {
  error: unknown;
  accountStatus: UiInitPayload["accountStatus"] | null;
  rateLimits: CodexRateLimits | null;
}): boolean {
  void input;
  return false;
}
