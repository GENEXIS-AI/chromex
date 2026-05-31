import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { BridgeDiagnosticLogStore } from "../src/diagnostics.js";

describe("BridgeDiagnosticLogStore", () => {
  test("writes local JSONL diagnostics without raw image bytes or secrets", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "codex-sidepanel-logs-"));
    const logs = new BridgeDiagnosticLogStore({ rootDir });

    await logs.record("image.edit.start", {
      promptPreview: "도넛을 피자로 변경해줘.",
      base64: "RAW_IMAGE_BYTES",
      apiKey: "sk-secret",
      cookie: "SID=private-cookie",
      sessionId: "session-private",
      credentials: { username: "alice@example.com", password: "pw" },
      statusMessage: "fallback used sk-value-leak",
      previewUrl: "data:image/png;base64,RAW_PREVIEW_BYTES",
      mimeType: "image/jpeg",
    });

    const snapshot = await logs.describeLogFolder();
    expect(snapshot.rootDir).toBe(rootDir);
    expect(snapshot.latestLogPath).toBe(join(rootDir, "bridge.log"));

    const content = await readFile(snapshot.latestLogPath, "utf8");
    expect(content).toContain("image.edit.start");
    expect(content).toContain("도넛을 피자로 변경해줘.");
    expect(content).toContain("[redacted]");
    expect(content).not.toContain("RAW_IMAGE_BYTES");
    expect(content).not.toContain("RAW_PREVIEW_BYTES");
    expect(content).not.toContain("sk-secret");
    expect(content).not.toContain("sk-value-leak");
    expect(content).not.toContain("private-cookie");
    expect(content).not.toContain("session-private");
    expect(content).not.toContain("alice@example.com");
  });
});
