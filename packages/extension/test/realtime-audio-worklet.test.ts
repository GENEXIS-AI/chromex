import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(__dirname, "../src/sidepanel/index.ts"), "utf8");

describe("realtime audio input", () => {
  test("uses AudioWorkletNode instead of deprecated ScriptProcessorNode", () => {
    expect(sidepanelSource).toContain("AudioWorkletNode");
    expect(sidepanelSource).toContain("realtime-audio-input-worklet.js");
    expect(sidepanelSource).not.toContain("createScriptProcessor");
    expect(sidepanelSource).not.toContain("ScriptProcessorNode");
  });

  test("ships the audio worklet module with extension public assets", () => {
    const workletPath = resolve(__dirname, "../public/realtime-audio-input-worklet.js");
    expect(existsSync(workletPath)).toBe(true);
    expect(readFileSync(workletPath, "utf8")).toContain('registerProcessor("realtime-audio-input"');
  });
});
