import { describe, expect, test } from "vitest";

import { toFriendlyNativeHostErrorMessage } from "../src/background/native-host-errors.js";

describe("native host diagnostics", () => {
  test("explains missing native host installs clearly", () => {
    expect(
      toFriendlyNativeHostErrorMessage("Specified native messaging host not found."),
    ).toContain("--browser=chrome");
    expect(
      toFriendlyNativeHostErrorMessage("Specified native messaging host not found."),
    ).toContain("Chrome Web Store installs");
  });

  test("does not report an exited Windows launcher as an uninstalled host", () => {
    const message = toFriendlyNativeHostErrorMessage("Native host has exited.");

    expect(message).toContain("exited immediately");
    expect(message).toContain("reload the extension");
    expect(message).toContain("Connection");
    expect(message).not.toContain("is not installed");
    expect(message).not.toContain("do not start codex app-server --listen manually");
  });

  test("explains extension id mismatches clearly", () => {
    const message = toFriendlyNativeHostErrorMessage(
      "Access to the specified native messaging host is forbidden.",
    );

    expect(message).toContain("different native host registration");
    expect(message).toContain("current-user registry");
  });

  test("keeps unknown disconnects actionable", () => {
    expect(toFriendlyNativeHostErrorMessage("Native host disconnected")).toContain("native host");
  });
});
