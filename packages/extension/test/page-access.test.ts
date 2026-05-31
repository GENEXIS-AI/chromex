import { describe, expect, test } from "vitest";

import {
  buildTabOriginPermission,
  isSitePermissionRequiredError,
  shouldAttemptTabOriginRecovery,
  SitePermissionRequiredError,
} from "../src/page-access.js";

describe("page access helpers", () => {
  test("builds an origin-scoped permission request for regular web tabs", () => {
    expect(buildTabOriginPermission("https://example.org/docs?q=1")).toEqual({
      origins: ["https://example.org/*"],
    });
  });

  test("does not build an origin permission request for restricted pages", () => {
    expect(buildTabOriginPermission("chrome://extensions")).toBeNull();
  });

  test("does not request origin permissions for file pages because Chrome exposes a separate file access switch", () => {
    expect(buildTabOriginPermission("file:///Users/test/page.html")).toBeNull();
  });

  test("attempts recovery only for host-access failures on regular web tabs", () => {
    const hostAccessError = new Error("Cannot access contents of url \"https://example.org/docs\". Extension manifest must request permission to access this host.");
    const transientError = new Error("The message port closed before a response was received.");

    expect(shouldAttemptTabOriginRecovery("https://example.org/docs", hostAccessError)).toBe(true);
    expect(shouldAttemptTabOriginRecovery("https://example.org/docs", transientError)).toBe(false);
    expect(shouldAttemptTabOriginRecovery("chrome://extensions", hostAccessError)).toBe(false);
    expect(shouldAttemptTabOriginRecovery("file:///Users/test/page.html", hostAccessError)).toBe(false);
  });

  test("wraps missing site access with a retryable UI permission request", () => {
    const error = new SitePermissionRequiredError("https://example.org/docs");

    expect(isSitePermissionRequiredError(error)).toBe(true);
    expect(error.permission).toEqual({
      origins: ["https://example.org/*"],
    });
    expect(error.message).toContain("before it can read this tab");
  });

  test("requests the capture-visible-tab permission shape for screen capture fallback", () => {
    const error = new SitePermissionRequiredError("https://example.org/docs", { captureOnly: true });

    expect(error.permission).toEqual({
      origins: ["<all_urls>"],
    });
    expect(error.message).toContain("before it can capture the current screen");
  });
});
