import { describe, expect, test } from "vitest";

import {
  BrowserPermissionRequiredError,
  isBrowserPermissionRequiredError,
} from "../src/browser-permission-errors.js";

describe("browser permission errors", () => {
  test("keeps optional permission requests structured for the side panel", () => {
    const error = new BrowserPermissionRequiredError(
      { permissions: ["history"] },
      "Allow Codex to search your browser history only when you ask for it.",
    );

    expect(isBrowserPermissionRequiredError(error)).toBe(true);
    expect(error.permission).toEqual({ permissions: ["history"] });
    expect(error.rationale).toBe("Allow Codex to search your browser history only when you ask for it.");
  });

  test("does not classify plain errors as permission requests", () => {
    expect(isBrowserPermissionRequiredError(new Error("network failed"))).toBe(false);
  });
});
