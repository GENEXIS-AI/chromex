import { describe, expect, test } from "vitest";

import { BrowserPermissionRequiredError } from "../src/browser-permission-errors.js";
import { SitePermissionRequiredError } from "../src/page-access.js";
import {
  shouldLogBackgroundMessageError,
  toExpectedPermissionErrorResponse,
} from "../src/background/background-error-response.js";

describe("background error responses", () => {
  test("converts expected site permission errors without treating them as failures", () => {
    const error = new SitePermissionRequiredError("https://example.com/post");

    expect(toExpectedPermissionErrorResponse(error)).toEqual({
      error: error.message,
      requiresPermission: true,
      permission: { origins: ["https://example.com/*"] },
      rationale: error.rationale,
    });
    expect(shouldLogBackgroundMessageError(error)).toBe(false);
  });

  test("converts expected browser permission errors without treating them as failures", () => {
    const error = new BrowserPermissionRequiredError(
      { permissions: ["history"] },
      "Allow Codex to search your browser history only when you ask for it.",
    );

    expect(toExpectedPermissionErrorResponse(error)).toEqual({
      error: error.message,
      requiresPermission: true,
      permission: { permissions: ["history"] },
      rationale: error.rationale,
    });
    expect(shouldLogBackgroundMessageError(error)).toBe(false);
  });

  test("recognizes serialized permission errors from runtime boundaries", () => {
    expect(
      shouldLogBackgroundMessageError({
        name: "SitePermissionRequiredError",
        message: "Codex needs access to this site before it can read this tab.",
        permission: { origins: ["https://example.com/*"] },
        rationale: "Codex needs access to this site before it can read this tab.",
      }),
    ).toBe(false);
    expect(
      shouldLogBackgroundMessageError({
        name: "BrowserPermissionRequiredError",
        message: "Allow Codex to search your browser history only when you ask for it.",
        permission: { permissions: ["history"] },
        rationale: "Allow Codex to search your browser history only when you ask for it.",
      }),
    ).toBe(false);
  });

  test("keeps expected stale thread and image asset failures out of noisy background logs", () => {
    expect(shouldLogBackgroundMessageError(new Error("thread not found: 019dc610-b810-73a1-ae21-7c9efa2d88ca"))).toBe(
      false,
    );
    expect(shouldLogBackgroundMessageError(new Error("Generated image asset is no longer available."))).toBe(false);
  });

  test("keeps automatic tab-frame detachments out of noisy background logs", () => {
    expect(shouldLogBackgroundMessageError(new Error("Frame with ID 0 was removed."))).toBe(false);
    expect(shouldLogBackgroundMessageError(new Error("Codex temporarily lost its connection to this tab. Try the action once more."))).toBe(
      false,
    );
    expect(shouldLogBackgroundMessageError(new Error("No tab with id: 355471561"))).toBe(false);
    expect(shouldLogBackgroundMessageError(new Error("Could not load file: 'content.js'."))).toBe(false);
  });

  test("keeps expired OAuth sessions out of noisy background failure logs", () => {
    expect(
      shouldLogBackgroundMessageError(
        new Error(
          "Your access token could not be refreshed because you have since logged out or signed in to another account. Please sign in again.",
        ),
      ),
    ).toBe(false);
  });

  test("keeps expected user/account request failures out of noisy background logs", () => {
    expect(
      shouldLogBackgroundMessageError(
        new Error(
          "unexpected status 401 Unauthorized: Incorrect API key provided: sk-proj-abc123, auth error code: invalid_api_key",
        ),
      ),
    ).toBe(false);
    expect(shouldLogBackgroundMessageError(new Error("You've hit your usage limit. Try again later."))).toBe(false);
    expect(
      shouldLogBackgroundMessageError(
        new Error("Invalid image in your last message. Please remove it and try again."),
      ),
    ).toBe(false);
    expect(
      shouldLogBackgroundMessageError(
        new Error("failed to load configuration: No such file or directory (os error 2)"),
      ),
    ).toBe(false);
  });

  test("keeps Chrome extensions gallery script restrictions out of noisy background logs", () => {
    expect(shouldLogBackgroundMessageError(new Error("The extensions gallery cannot be scripted."))).toBe(false);
  });

  test("keeps expected protected-page and local-file access guidance out of noisy background logs", () => {
    expect(
      shouldLogBackgroundMessageError(
        new Error("Chrome blocks extensions from reading or modifying this protected browser page."),
      ),
    ).toBe(false);
    expect(
      shouldLogBackgroundMessageError(
        new Error("Local file pages require Chrome's Allow access to file URLs setting for Chromex."),
      ),
    ).toBe(false);
  });

  test("keeps unexpected errors visible in diagnostics", () => {
    expect(toExpectedPermissionErrorResponse(new Error("boom"))).toBeNull();
    expect(shouldLogBackgroundMessageError(new Error("boom"))).toBe(true);
  });
});
