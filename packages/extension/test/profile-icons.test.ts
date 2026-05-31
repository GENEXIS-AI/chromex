import { describe, expect, test } from "vitest";

import { renderProfileIcon } from "../src/sidepanel/profile-icons.js";

describe("profile icons", () => {
  test("renders configured profile icons through the icon library", () => {
    const html = renderProfileIcon("palette");

    expect(html).toContain("<svg");
    expect(html).toContain('data-profile-icon="palette"');
    expect(html).toContain("lucide");
    expect(html).not.toContain("undefined");
  });

  test("falls back to a safe library icon for unknown ids", () => {
    expect(renderProfileIcon("not-a-real-icon")).toContain('data-profile-icon="spark"');
  });
});
