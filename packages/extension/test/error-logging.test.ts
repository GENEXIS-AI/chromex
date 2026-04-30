import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

const backgroundSource = readSource("src/background/index.ts");

describe("error logging for silently swallowed failures", () => {
  test("logs handleTurnInterrupt failures instead of silently swallowing", () => {
    const block = sourceBetween(
      backgroundSource,
      "await handleTurnInterrupt(threadId, turnId).catch",
      "});",
    );
    expect(block).toContain("console.error");
    expect(block).toContain("Failed to interrupt turn:");
  });

  test("logs installImagePromptHoverForTab failures instead of silently swallowing", () => {
    const block = sourceBetween(
      backgroundSource,
      "void installImagePromptHoverForTab(activeTab).catch",
      "});",
    );
    expect(block).toContain("console.error");
    expect(block).toContain("Failed to install image prompt hover:");
  });

  test("logs recordDiagnostic failures instead of silently swallowing", () => {
    const funcBlock = sourceBetween(
      backgroundSource,
      "async function recordDiagnostic(event: string",
      "}\n\nasync function dataUrlToEditableJpegInput",
    );
    expect(funcBlock).toContain("console.error");
    expect(funcBlock).toContain("Failed to record diagnostic:");
    expect(funcBlock).not.toContain(".catch(() => undefined)");
  });
});
