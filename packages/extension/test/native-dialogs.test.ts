import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");

describe("native sidepanel dialogs", () => {
  test("does not use browser input popups for user-entered secrets or confirmations", () => {
    expect(sidepanelSource).not.toContain("window.prompt");
    expect(sidepanelSource).not.toContain("window.confirm");
    expect(sidepanelSource).not.toContain("window.alert");
  });

  test("renders internal dialogs for text input and action confirmation", () => {
    expect(sidepanelSource).toContain("nativeTextDialog");
    expect(sidepanelSource).toContain("nativeConfirmationDialog");
    expect(sidepanelSource).toContain("native-dialog-backdrop");
    expect(sidepanelSource).toContain("annotation-text-popover");
  });
});
