import { describe, expect, test } from "vitest";

import { shouldShowPermissionStatusBanner } from "../src/sidepanel/permission-status.js";

describe("permission status display", () => {
  test("does not show persistent banners for site access prompts", () => {
    expect(
      shouldShowPermissionStatusBanner({
        origins: ["https://example.org/*"],
        rationale: "Allow Codex to read the current site when your request needs page context.",
      }),
    ).toBe(false);
  });

  test("does not show persistent banners for optional browser API permission prompts", () => {
    expect(
      shouldShowPermissionStatusBanner({
        permissions: ["history"],
        rationale: "Allow Codex to search your browser history only when you ask for it.",
      }),
    ).toBe(false);
  });
});
