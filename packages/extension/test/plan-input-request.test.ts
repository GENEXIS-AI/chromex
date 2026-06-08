import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const normalizeLineEndings = (value: string): string => value.replace(/\r\n/gu, "\n");

const sidepanelSource = normalizeLineEndings(readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8"));
const backgroundSource = normalizeLineEndings(readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8"));
const sidepanelCss = normalizeLineEndings(readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8"));

describe("plan input request handling", () => {
  test("starts composer plan mode without wiring it through /goal", () => {
    expect(sidepanelSource).toContain("planMode: true");
    expect(sidepanelSource).not.toContain("goalObjective: displayMessage || message");
    expect(sidepanelSource).not.toContain("Codex app-server의 /goal 지원 상태");
  });

  test("promotes request_user_input into the active chat turn immediately", () => {
    expect(sidepanelSource).toContain("function applyPlanUserInputRequest");
    expect(sidepanelSource).toContain("rememberConversationThreadId(state.currentConversationId, event.threadId.trim())");
    expect(sidepanelSource).toContain("promptActivitiesByConversationId.delete(state.currentConversationId);");
    expect(sidepanelSource).toContain("state.promptActivity = null;");
    expect(sidepanelSource).toContain("state.activeTurn = {");
    expect(sidepanelSource).toContain("revealPlanInputPanel();");
  });

  test("reveals the plan input panel when Codex asks a follow-up question", () => {
    expect(sidepanelSource).toContain("function revealPlanInputPanel()");
    expect(sidepanelSource).toContain("planPanel.scrollIntoView({");
    expect(sidepanelSource).toContain("planPanel.querySelector<HTMLTextAreaElement>(\"#plan-input-custom\")");
  });

  test("routes ambiguous plan-mode clarification into a local question panel", () => {
    expect(backgroundSource).toContain("extension.plan_mode.local_clarification");
    expect(backgroundSource).toContain("planClarification: {");
    expect(backgroundSource).toContain("routeIntent?.needsClarification");
    expect(sidepanelSource).toContain("function applyLocalPlanClarificationRequest");
    expect(sidepanelSource).toContain("local: true");
    expect(sidepanelSource).toContain("buildLocalPlanClarificationPrompt");
    expect(sidepanelSource).toContain("result.planClarification?.question");
  });

  test("renders plan input inside the composer frame instead of stacking above it", () => {
    expect(sidepanelSource).toContain('${state.pendingPlanInputRequest ? "plan-input-active" : ""}');
    expect(sidepanelSource).toContain("state.pendingPlanInputRequest\n              ? renderPlanInputPanel(strings)");
    expect(sidepanelSource).not.toContain("${renderPlanInputPanel(strings)}\n        <div class=\"composer-frame");
    expect(sidepanelCss).toContain(".composer-frame.plan-input-active");
    expect(sidepanelCss).toContain(".composer-frame.plan-input-active .plan-input-panel");
    expect(sidepanelCss).toContain("max-width: none;");
  });

  test("keeps plan input controls compact inside the composer frame", () => {
    expect(sidepanelCss).toContain(".composer-frame.plan-input-active .plan-input-custom textarea");
    expect(sidepanelCss).toContain(".composer-frame.plan-input-active .plan-input-custom textarea::placeholder");
    expect(sidepanelCss).toContain("font-size: 13px;");
    expect(sidepanelCss).toContain("grid-template-columns: 24px minmax(0, 1fr) 22px;");
  });

  test("renders turn plans as an explicit accept-or-revise chat card", () => {
    expect(sidepanelSource).toContain("function renderTurnPlanDecisionCard");
    expect(sidepanelSource).toContain("data-turn-plan-accept");
    expect(sidepanelSource).toContain("data-turn-plan-revise");
    expect(sidepanelSource).toContain("function acceptTurnPlan");
    expect(sidepanelSource).toContain("await setPlanModeEnabled(false");
  });
});
