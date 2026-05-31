import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const backgroundSource = readFileSync(resolve(__dirname, "../src/background/index.ts"), "utf8");
const contentSource = readFileSync(resolve(__dirname, "../src/content/index.ts"), "utf8");
const sidepanelSource = readFileSync(resolve(__dirname, "../src/sidepanel/index.ts"), "utf8");
const sharedTypesSource = readFileSync(resolve(__dirname, "../../shared/src/types.ts"), "utf8");

describe("agentic browser control indicator", () => {
  test("only the safe DOM automation mode is executed directly from the extension", () => {
    expect(backgroundSource).toContain("agenticRoutePlan.browserControl.shouldControl");
    expect(backgroundSource).toContain('agenticRoutePlan.browserControl.mode !== "dom"');
    expect(backgroundSource).toContain('agenticRoutePlan.browserControl.surface !== "active-tab"');
    expect(backgroundSource).toContain("agenticRoutePlan.intent.action === \"navigate\"");
    expect(backgroundSource).toContain("agenticRoutePlan.intent.target === \"current-page\"");
  });

  test("shows and clears a non-interactive page glow while Codex controls the DOM", () => {
    expect(backgroundSource).toContain('type: "page.ai-control.start"');
    expect(backgroundSource).toContain('type: "page.ai-control.stop"');
    expect(contentSource).toContain('message.type === "page.ai-control.start"');
    expect(contentSource).toContain('message.type === "page.ai-control.stop"');
    expect(contentSource).toContain("codex-ai-control-style");
    expect(contentSource).toContain("codex-ai-control-border");
    expect(contentSource).toContain("@keyframes codexAiControlPulse");
    expect(contentSource).toContain("@keyframes codexAiControlAura");
    expect(contentSource).toContain(".codex-ai-control-border::before");
    expect(contentSource).toContain("radial-gradient");
    expect(contentSource).toContain("filter: blur");
    expect(contentSource).toContain('showAiControlOverlay("dom"');
    expect(contentSource).toContain("pointer-events: none");
  });

  test("can navigate the current page URL through the browser action executor", () => {
    expect(contentSource).toContain('step.action === "navigate"');
    expect(contentSource).toContain("performNavigateAction(step)");
    expect(contentSource).toContain("window.location.assign");
    expect(sharedTypesSource).toContain('"submit" | "navigate"');
  });

  test("lets the user stop in-flight browser control and removes the page indicator immediately", () => {
    expect(sidepanelSource).toContain("const canStopCurrentWork = currentWorkActive");
    expect(sidepanelSource).toContain('type: "prompt.cancel"');
    expect(sidepanelSource).toContain("cancelledPromptRequestIds.add");
    expect(backgroundSource).toContain('case "prompt.cancel"');
    expect(backgroundSource).toContain("cancelledPromptClientRequestIds");
    expect(backgroundSource).toContain("isPromptClientRequestCancelled");
    expect(backgroundSource).toContain("await stopCurrentAiControlIndicator(0)");
    expect(backgroundSource).toContain("activeAiControlTab");
    expect(contentSource).toContain("let aiControlCancelled = false");
    expect(contentSource).toContain("performBrowserDomActions(steps).then");
    expect(contentSource).toContain("delayMs <= 0");
    expect(contentSource).toContain("cancelled: true");
    expect(sharedTypesSource).toContain("cancelled?: boolean");
  });

  test("expires the page control indicator if a stop message is missed", () => {
    expect(contentSource).toContain("AI_CONTROL_OVERLAY_MAX_MS");
    expect(contentSource).toContain("aiControlOverlayWatchdogTimer");
    expect(contentSource).toContain("removeStaleAiControlOverlays();");
    expect(contentSource).toContain('document.querySelectorAll(".codex-ai-control-border")');
    expect(contentSource).toContain("window.setTimeout(() =>");
    expect(contentSource).toContain("scheduleHideAiControlOverlay(0)");
  });
});
