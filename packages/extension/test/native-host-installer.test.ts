import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const installerSource = readFileSync(resolve(process.cwd(), "../../scripts/install-native-host.mjs"), "utf8");

describe("native host installer", () => {
  test("registers Windows native messaging hosts in both registry views", () => {
    expect(installerSource).toContain("registerWindowsNativeHost");
    expect(installerSource).toContain('"/reg:32"');
    expect(installerSource).toContain('"/reg:64"');
  });

  test("prints Windows verification commands for both registry views", () => {
    expect(installerSource).toContain("/reg:32");
    expect(installerSource).toContain("/reg:64");
  });

  test("allows the Chrome Web Store extension id by default", () => {
    expect(installerSource).toContain('CHROME_WEB_STORE_EXTENSION_ID = "odlalmnpmmakfigepbaabimjcmcppgfo"');
    expect(installerSource).toContain("CHROME_WEB_STORE_EXTENSION_ID");
    expect(installerSource).toContain("extensionIdArg ?? derivedExtensionId ?? CHROME_WEB_STORE_EXTENSION_ID");
    expect(installerSource).toContain("Chrome Web Store extension ID included automatically");
  });

  test("supports the prebuilt local bridge package without source bridge dependencies", () => {
    expect(installerSource).toContain('resolve(repoRoot, "bridge/cli.bundle.cjs")');
    expect(installerSource).toContain('resolve(repoRoot, "bridge/cli.bundle.mjs")');
    expect(installerSource).toContain("findFirstExistingPath");
    expect(installerSource).toContain("sourceBridgeEntryPath");
  });
});
