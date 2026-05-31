import { describe, expect, test } from "vitest";

import { requestOptionalPermissionsWithResult } from "../src/sidepanel/permission-request.js";

describe("permission request helper", () => {
  test("preserves Chrome lastError when a permission prompt cannot be opened", async () => {
    const runtime = {
      lastError: {
        message: "This function must be called during a user gesture",
      },
    };
    const permissions = {
      request: (_request: chrome.permissions.Permissions, callback: (granted: boolean) => void) => callback(false),
    };

    await expect(
      requestOptionalPermissionsWithResult(
        {
          origins: ["https://example.org/*"],
        },
        permissions,
        runtime,
      ),
    ).resolves.toEqual({
      granted: false,
      errorMessage: "This function must be called during a user gesture",
    });
  });
});
