import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { isQuickInteractionLocked } from "../src/sidepanel/interaction-lock.js";

const sidepanelSource = readFileSync(resolve(__dirname, "../src/sidepanel/index.ts"), "utf8");

describe("quick interaction lock", () => {
  test("locks quick controls while a response is being prepared or generated", () => {
    expect(isQuickInteractionLocked({ turnActive: true, promptActivityActive: false })).toBe(true);
    expect(isQuickInteractionLocked({ turnActive: false, promptActivityActive: true })).toBe(true);
    expect(isQuickInteractionLocked({ turnActive: false, promptActivityActive: false })).toBe(false);
  });

  test("does not use the quick lock for top navigation controls", () => {
    expect(sidepanelSource).not.toMatch(/#new-chat"\)\?\.addEventListener\("click", \(\) => \{\s+if \(isQuickInteractionLockedForState\(\)\)/u);
    expect(sidepanelSource).not.toMatch(/#app-menu-toggle"\)\?\.addEventListener\("click", \(\) => \{\s+if \(isQuickInteractionLockedForState\(\)\)/u);
    expect(sidepanelSource).not.toMatch(/#popout-chat"\)\?\.addEventListener\("click", async \(\) => \{\s+if \(isQuickInteractionLockedForState\(\)\)/u);
    expect(sidepanelSource).not.toMatch(/#dock-chat"\)\?\.addEventListener\("click", async \(\) => \{\s+if \(isQuickInteractionLockedForState\(\)\)/u);
  });
});
