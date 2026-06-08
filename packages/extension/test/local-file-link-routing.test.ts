import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");

describe("local file link routing", () => {
  test("routes local chat file links through the native bridge instead of relying on file URLs", () => {
    expect(sidepanelSource).toContain("[data-local-file-path]");
    expect(sidepanelSource).toContain("openLocalFileLink");
    expect(sidepanelSource).toContain('type: "local.file.reveal"');
    expect(backgroundSource).toContain('case "local.file.reveal"');
    expect(backgroundSource).toContain('bridge.request("local.file.reveal"');
  });
});
