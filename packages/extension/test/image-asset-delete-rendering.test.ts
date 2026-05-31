import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");

describe("generated image asset lifecycle UI", () => {
  test("keeps generated assets saved locally instead of deleting them after preview", () => {
    expect(sidepanelSource).not.toContain("data-image-delete-asset");
    expect(sidepanelSource).not.toContain("deleteConversationImageAsset");
    expect(sidepanelSource).toContain("rememberAutoSavedConversationImage");
    expect(sidepanelSource).toContain("sidepanel.image.asset.auto_saved");
    expect(sidepanelSource).not.toContain("await releaseConversationImageAsset(image);");
    expect(sidepanelSource).toContain("image.assetRef");
  });

  test("routes image asset deletion through the background bridge", () => {
    expect(backgroundSource).toContain('case "image.asset.delete"');
    expect(backgroundSource).toContain('bridge.request("image.asset.delete"');
  });
});
