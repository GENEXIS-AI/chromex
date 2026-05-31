import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const stylesSource = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8");

describe("turn steer sidepanel wiring", () => {
  test("routes active-turn composer sends through turn.steer", () => {
    expect(sidepanelSource).toContain("shouldSendComposerAsTurnSteer");
    expect(sidepanelSource).toContain('type: sendAsTurnSteer ? "turn.steer" : "prompt.send"');
  });

  test("only direct composer text can become a steer request during active work", () => {
    expect(sidepanelSource).toContain("const isDirectComposerTextSend =");
    expect(sidepanelSource).toContain('source: isDirectComposerTextSend ? "composer" : "programmatic"');
    expect(sidepanelSource).toContain("canSendCurrentComposerMessage(message, { allowSteer: isDirectComposerTextSend })");
  });

  test("captures the active turn at submit and keeps steer acceptance from overwriting active prompt state", () => {
    expect(sidepanelSource).toContain('from "./active-turn-after-send.js"');
    expect(sidepanelSource).toContain("const activeTurnAtSubmit = state.activeTurn ? { ...state.activeTurn } : null;");
    expect(sidepanelSource).toContain("activeTurn: activeTurnAtSubmit,");
    expect(sidepanelSource).toContain("if (sendAsTurnSteer) {");
    expect(sidepanelSource).toContain("clearSteeringPromptActivity(clientRequestId, conversationIdAtStart);");
    expect(sidepanelSource).toContain("const acceptedActiveTurn = resolveAcceptedPromptActiveTurn({");
    expect(sidepanelSource).toContain("state.activeTurn = sendAsTurnSteer ? state.activeTurn : acceptedActiveTurn;");
  });

  test("does not create prompt activity cards for direct steer sends", () => {
    expect(sidepanelSource).toContain("state.promptActivity = sendAsTurnSteer");
    expect(sidepanelSource).toContain("if (!sendAsTurnSteer) {");
    expect(sidepanelSource).toContain("promptActivitiesByConversationId.set(conversationIdAtStart, promptActivity);");
  });

  test("recovers composer text when the background rejects a stale steer request", () => {
    expect(sidepanelSource).toContain("isTurnSteerFailureResult(result)");
    expect(sidepanelSource).toContain("handleTurnSteerFailureResult({");
    expect(sidepanelSource).toContain("turnSteerExpired");
  });

  test("marks and renders steer messages as guided conversation adjustments", () => {
    expect(sidepanelSource).toContain("...(sendAsTurnSteer ? { steer: true } : {})");
    expect(sidepanelSource).toContain("renderTurnSteerMessageMeta");
    expect(sidepanelSource).toContain("message-steer-meta");
    expect(sidepanelSource).toContain("getTurnSteerMessageLabel");
    expect(stylesSource).toContain(".message-row.user.steer-message");
    expect(stylesSource).toContain(".message-steer-meta");
  });
});
