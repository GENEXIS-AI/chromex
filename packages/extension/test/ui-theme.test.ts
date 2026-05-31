import { describe, expect, test } from "vitest";

import { normalizeUiThemeSetting, resolveUiTheme } from "../src/ui-theme.js";

describe("UI theme support", () => {
  test("normalizes persisted theme settings with system as the safe default", () => {
    expect(normalizeUiThemeSetting("system")).toBe("system");
    expect(normalizeUiThemeSetting("dark")).toBe("dark");
    expect(normalizeUiThemeSetting("light")).toBe("light");
    expect(normalizeUiThemeSetting("unknown")).toBe("system");
    expect(normalizeUiThemeSetting(undefined)).toBe("system");
  });

  test("resolves system theme from the browser color-scheme preference", () => {
    expect(resolveUiTheme("system", true)).toBe("dark");
    expect(resolveUiTheme("system", false)).toBe("light");
    expect(resolveUiTheme("dark", false)).toBe("dark");
    expect(resolveUiTheme("light", true)).toBe("light");
  });
});
