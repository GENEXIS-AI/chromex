import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");

describe("regenerate profile routing", () => {
  test("passes the original user message profile to the replayed prompt", () => {
    expect(sidepanelSource).toContain("profileId: replay.profileId");
    expect(sidepanelSource).not.toContain("sendPrompt(replay.prompt, { resetThread: true });");
  });
});
