import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { isRecoverableTurnSteerError } from "../src/background/turn-steer-recovery.js";

const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");

function getFunctionSource(source: string, name: string): string {
  const startMatch = new RegExp(`(?:async\\s+)?function\\s+${name}\\b`, "u").exec(source);
  const start = startMatch?.index ?? -1;
  if (start < 0) {
    return "";
  }
  const rest = source.slice(start + 1);
  const nextMatch = /\n(?:async\s+)?function\s+/u.exec(rest);
  return nextMatch ? source.slice(start, start + 1 + nextMatch.index) : source.slice(start);
}

describe("turn steer recovery", () => {
  test("treats stale active-turn errors as recoverable", () => {
    expect(isRecoverableTurnSteerError(new Error("no active turn to steer"))).toBe(true);
  });

  test("does not hide unrelated app-server errors", () => {
    expect(isRecoverableTurnSteerError(new Error("model not available"))).toBe(false);
  });

  test("does not turn an explicit steer request into a new prompt send", () => {
    const handleTurnSteerSource = getFunctionSource(backgroundSource, "handleTurnSteer");

    expect(handleTurnSteerSource).not.toContain("return handlePromptSend(payload)");
  });

  test("does not run prompt workflows before steering an active turn", () => {
    const handleTurnSteerSource = getFunctionSource(backgroundSource, "handleTurnSteer");

    expect(handleTurnSteerSource).not.toContain("maybeHandleAgenticImageWorkflow");
    expect(handleTurnSteerSource).not.toContain("maybeHandleAgenticImageGenerationWorkflow");
    expect(handleTurnSteerSource).not.toContain("maybeHandleBrowserDomActionWorkflow");
  });
});
