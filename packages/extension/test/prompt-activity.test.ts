import { describe, expect, test } from "vitest";

import {
  formatPromptActivityLabel,
  getPromptActivityDetail,
  getPromptActivityLabel,
  getPromptActivitySteps,
} from "../src/sidepanel/prompt-activity.js";
import {
  getEffectivePromptActivityForActiveWork,
  promotePromptActivityForAssistantProgress,
  promotePromptActivityForTurnActivity,
  shouldClearPromptActivityOnMessageCompleted,
  shouldClearPromptActivityOnTurnCompleted,
} from "../src/sidepanel/prompt-activity-lifecycle.js";

describe("prompt activity labels", () => {
  test("renders Korean progress labels for context and response phases", () => {
    expect(getPromptActivityLabel("collecting-context", "ko")).toBe("페이지 컨텍스트 읽는 중");
    expect(getPromptActivityLabel("responding", "ko")).toBe("응답을 스트리밍 중");
  });

  test("provides dynamic detail copy while Codex receives the request", () => {
    expect(getPromptActivityLabel("waiting-for-codex", "ko")).toBe("Codex 작업공간에 전달 중");
    expect(getPromptActivityDetail("waiting-for-codex", "ko")).toContain("요청, 컨텍스트, 첨부 파일");
    expect(getPromptActivityLabel("compacting", "ko")).toBe("대화 기록 압축 중");
  });

  test("marks progress steps up to the active phase", () => {
    expect(getPromptActivitySteps("waiting-for-codex", "en")).toEqual([
      { id: "preparing", label: "Prepare", state: "done" },
      { id: "routing", label: "Plan", state: "done" },
      { id: "compacting", label: "Compact", state: "done" },
      { id: "collecting-context", label: "Read", state: "done" },
      { id: "waiting-for-codex", label: "Send", state: "active" },
      { id: "responding", label: "Stream", state: "pending" },
    ]);
  });

  test("renders image-edit specific progress instead of a generic Codex handoff loop", () => {
    expect(getPromptActivityLabel("editing-image", "ko")).toBe("이미지를 편집하는 중");
    expect(getPromptActivityDetail("editing-image", "ko")).toContain("이미지 생성은 일반 텍스트보다 오래 걸릴 수 있습니다");
    expect(getPromptActivitySteps("rendering-image-preview", "ko")).toEqual([
      { id: "preparing-image", label: "대상", state: "done" },
      { id: "editing-image", label: "편집", state: "done" },
      { id: "rendering-image-preview", label: "미리보기", state: "active" },
    ]);
  });

  test("renders reconnect retry count as the primary activity label", () => {
    expect(
      formatPromptActivityLabel(
        {
          clientRequestId: "prompt-retry-1",
          phase: "reconnecting",
          retryAttempt: 3,
          retryMax: 5,
        },
        "en",
      ),
    ).toBe("Reconnecting... 3/5");
    expect(getPromptActivityDetail("reconnecting", "ko")).toContain("자동으로 다시 시도");
  });

  test("keeps response progress visible while an active turn is still running", () => {
    const activeTurn = { threadId: "thread-1", turnId: "turn-1" };
    expect(
      promotePromptActivityForAssistantProgress({
        current: { clientRequestId: "prompt-1", phase: "waiting-for-codex" },
        activeTurn,
      }),
    ).toEqual({ clientRequestId: "prompt-1", phase: "responding" });
    expect(
      shouldClearPromptActivityOnMessageCompleted({
        current: { clientRequestId: "prompt-1", phase: "responding" },
        activeTurn,
      }),
    ).toBe(false);
    expect(
      shouldClearPromptActivityOnTurnCompleted({
        current: { clientRequestId: "prompt-1", phase: "responding" },
        activeTurn,
        completedTurnId: "turn-1",
      }),
    ).toBe(true);
  });

  test("restores a response progress indicator for tool-only activity events", () => {
    expect(
      promotePromptActivityForAssistantProgress({
        current: null,
        activeTurn: { threadId: "thread-1", turnId: "turn-tool-only" },
      }),
    ).toEqual({ clientRequestId: "turn:turn-tool-only", phase: "responding" });
  });

  test("derives a visible progress indicator when a tool turn is active but prompt activity was cleared", () => {
    expect(
      getEffectivePromptActivityForActiveWork({
        current: null,
        activeTurn: { threadId: "thread-1", turnId: "turn-tool-only" },
      }),
    ).toEqual({ clientRequestId: "turn:turn-tool-only", phase: "responding" });
  });

  test("routes image-generation tool activity to image progress instead of streaming response", () => {
    expect(
      promotePromptActivityForTurnActivity({
        current: { clientRequestId: "prompt-image-1", phase: "responding" },
        activeTurn: { threadId: "thread-1", turnId: "turn-image" },
        kind: "image",
        status: "running",
      }),
    ).toEqual({ clientRequestId: "prompt-image-1", phase: "editing-image" });
    expect(
      promotePromptActivityForTurnActivity({
        current: { clientRequestId: "prompt-image-1", phase: "editing-image" },
        activeTurn: { threadId: "thread-1", turnId: "turn-image" },
        kind: "image",
        status: "completed",
      }),
    ).toEqual({ clientRequestId: "prompt-image-1", phase: "rendering-image-preview" });
  });

  test("does not resurrect completed non-image tool activity as active response progress", () => {
    expect(
      promotePromptActivityForTurnActivity({
        current: null,
        activeTurn: { threadId: "thread-1", turnId: "turn-completed-tool" },
        kind: "tool",
        status: "completed",
      }),
    ).toBeNull();
  });
});
