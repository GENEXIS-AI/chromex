import { describe, expect, test } from "vitest";

import { chromiumExecutableCandidates, formatPlaywrightInstallCommand } from "../src/playwright-runtime.js";

describe("Playwright runtime helpers", () => {
  test("quotes Playwright install commands so Windows paths with spaces can be copied safely", () => {
    expect(formatPlaywrightInstallCommand("C:\\Users\\Example User\\chromex\\node_modules\\playwright-core\\cli.js")).toBe(
      'node "C:\\Users\\Example User\\chromex\\node_modules\\playwright-core\\cli.js" install chromium',
    );
  });

  test("recognizes current Windows Playwright Chromium cache layouts", () => {
    expect(chromiumExecutableCandidates("win32")).toEqual([
      "chrome-win/chrome.exe",
      "chrome-win64/chrome.exe",
      "chrome-win/headless_shell.exe",
      "chrome-win64/headless_shell.exe",
    ]);
  });

  test("recognizes current macOS Playwright Chromium cache layouts", () => {
    expect(chromiumExecutableCandidates("darwin")).toContain(
      "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    );
  });
});
