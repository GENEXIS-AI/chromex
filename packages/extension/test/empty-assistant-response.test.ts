import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  clearEmptyAssistantResponseNotice,
  clearResolvedEmptyAssistantResponseNotices,
  createEmptyAssistantResponseNotice,
  getStructuredInputNamesForEmptyResponseNotice,
  shouldShowEmptyAssistantResponseNotice,
} from "../src/sidepanel/empty-assistant-response.js";
import type { ConversationMessage } from "../src/types.js";

const sidepanelSource = readFileSync(resolve(__dirname, "../src/sidepanel/index.ts"), "utf8");

describe("empty assistant response fallback", () => {
  test("shows a fallback when a turn only produced trace output", () => {
    expect(
      shouldShowEmptyAssistantResponseNotice({
        messages: [
          userMessage("user-1"),
          {
            id: "turn-trace-thread-1-turn-1",
            role: "assistant",
            text: "",
            trace: [{ id: "tool-1", kind: "tool", title: "Tool result ready", detail: "userMessage", status: "completed", timestampMs: 1 }],
          },
        ],
        traceMessageId: "turn-trace-thread-1-turn-1",
        activeUserMessageId: "user-1",
      }),
    ).toBe(true);
  });

  test("does not show a fallback when assistant text already arrived for the same prompt", () => {
    expect(
      shouldShowEmptyAssistantResponseNotice({
        messages: [
          userMessage("user-1"),
          {
            id: "turn-trace-thread-1-turn-1",
            role: "assistant",
            text: "",
            trace: [{ id: "tool-1", kind: "tool", title: "Tool result ready", detail: "userMessage", status: "completed", timestampMs: 1 }],
          },
          {
            id: "assistant-response-1",
            role: "assistant",
            text: "일정을 만들었습니다.",
          },
        ],
        traceMessageId: "turn-trace-thread-1-turn-1",
        activeUserMessageId: "user-1",
      }),
    ).toBe(false);
  });

  test("does not show a fallback when a plan card was produced for the same turn", () => {
    expect(
      shouldShowEmptyAssistantResponseNotice({
        messages: [
          userMessage("user-1"),
          {
            id: "turn-trace-thread-1-turn-1",
            role: "assistant",
            text: "",
            trace: [{ id: "plan-1", kind: "reasoning", title: "Plan", detail: "Draft first", status: "completed", timestampMs: 1 }],
            plan: {
              threadId: "thread-1",
              turnId: "turn-1",
              explanation: "Draft first, then verify.",
              steps: [{ step: "Draft the implementation plan", status: "completed" }],
            },
          },
        ],
        traceMessageId: "turn-trace-thread-1-turn-1",
        activeUserMessageId: "user-1",
      }),
    ).toBe(false);
  });

  test("does not show a fallback for an earlier tool-only turn when a later turn is still working", () => {
    expect(
      shouldShowEmptyAssistantResponseNotice({
        messages: [
          userMessage("user-1"),
          {
            id: "turn-trace-thread-1-turn-1",
            role: "assistant",
            text: "",
            trace: [{ id: "tool-1", kind: "tool", title: "Tool result ready", detail: "userMessage", status: "completed", timestampMs: 1 }],
          },
          {
            id: "turn-trace-thread-1-turn-2",
            role: "assistant",
            text: "",
            trace: [{ id: "tool-2", kind: "tool", title: "Tool running", detail: "gmail", status: "running", timestampMs: 2 }],
          },
        ],
        traceMessageId: "turn-trace-thread-1-turn-1",
        activeUserMessageId: "user-1",
      }),
    ).toBe(false);
  });

  test("includes selected app or plugin names in the visible reason", () => {
    const messages: ConversationMessage[] = [
      {
        ...userMessage("user-1"),
        structuredInputs: [
          {
            id: "google-calendar",
            type: "mention",
            name: "Google Calendar",
            path: "app://google-calendar",
          },
        ],
      },
    ];
    expect(getStructuredInputNamesForEmptyResponseNotice(messages, "user-1")).toEqual(["Google Calendar"]);
    expect(createEmptyAssistantResponseNotice({ locale: "ko", structuredInputNames: ["Google Calendar"] })).toContain(
      "선택한 연결: Google Calendar.",
    );
  });

  test("clears a stale empty-response notice when assistant text arrives later for the same turn", () => {
    const messages: ConversationMessage[] = [
      userMessage("user-1"),
      {
        id: "turn-trace-thread-1-turn-1",
        role: "assistant",
        text: createEmptyAssistantResponseNotice({ locale: "ko", structuredInputNames: [] }),
        trace: [{ id: "tool-1", kind: "tool", title: "Tool result ready", detail: "userMessage", status: "completed", timestampMs: 1 }],
      },
      {
        id: "assistant-response-1",
        role: "assistant",
        text: "차량 등록은 필요 없습니다.",
      },
    ];

    expect(clearEmptyAssistantResponseNotice({ messages, threadId: "thread-1", turnId: "turn-1" })).toBe(true);
    expect(messages.find((message) => message.id === "turn-trace-thread-1-turn-1")?.text).toBe("");
  });

  test("clears a stale empty-response notice when the recovered assistant text arrives without turn ids", () => {
    const messages: ConversationMessage[] = [
      userMessage("user-1"),
      {
        id: "turn-trace-thread-1-turn-1",
        role: "assistant",
        text: createEmptyAssistantResponseNotice({ locale: "ko", structuredInputNames: [] }),
        trace: [{ id: "tool-1", kind: "tool", title: "Tool result ready", detail: "userMessage", status: "completed", timestampMs: 1 }],
      },
      {
        id: "assistant-response-1",
        role: "assistant",
        text: "가장 가까운 유형은 소셜 카드입니다.",
      },
    ];

    expect(clearResolvedEmptyAssistantResponseNotices(messages)).toBe(true);
    expect(messages.find((message) => message.id === "turn-trace-thread-1-turn-1")?.text).toBe("");
  });

  test("clears a stale empty-response notice when later turn work continues before text arrives", () => {
    const messages: ConversationMessage[] = [
      userMessage("user-1"),
      {
        id: "turn-trace-thread-1-turn-1",
        role: "assistant",
        text: createEmptyAssistantResponseNotice({ locale: "ko", structuredInputNames: [] }),
        trace: [{ id: "tool-1", kind: "tool", title: "Tool result ready", detail: "userMessage", status: "completed", timestampMs: 1 }],
      },
      {
        id: "turn-trace-thread-1-turn-2",
        role: "assistant",
        text: "",
        trace: [{ id: "tool-2", kind: "tool", title: "Tool running", detail: "gmail", status: "running", timestampMs: 2 }],
      },
    ];

    expect(clearResolvedEmptyAssistantResponseNotices(messages)).toBe(true);
    expect(messages.find((message) => message.id === "turn-trace-thread-1-turn-1")?.text).toBe("");
  });

  test("keeps an older empty-response notice when a later user message starts a different turn", () => {
    const messages: ConversationMessage[] = [
      userMessage("user-1"),
      {
        id: "turn-trace-thread-1-turn-1",
        role: "assistant",
        text: createEmptyAssistantResponseNotice({ locale: "ko", structuredInputNames: [] }),
      },
      userMessage("user-2"),
      {
        id: "assistant-response-2",
        role: "assistant",
        text: "다음 요청에 대한 답변입니다.",
      },
    ];

    expect(clearResolvedEmptyAssistantResponseNotices(messages)).toBe(false);
    expect(messages.find((message) => message.id === "turn-trace-thread-1-turn-1")?.text).toContain(
      "Codex에서 최종 응답을 받지 못했습니다.",
    );
  });

  test("defers empty-response fallback after turn completion so late message.completed can win", () => {
    expect(sidepanelSource).toContain("EMPTY_ASSISTANT_RESPONSE_NOTICE_DELAY_MS");
    expect(sidepanelSource).toContain("scheduleEmptyAssistantResponseNotice(");
    expect(sidepanelSource).toContain("cancelEmptyAssistantResponseNotice(");
    expect(sidepanelSource).toContain("clearEmptyAssistantResponseNoticeForTurn(");
  });
});

function userMessage(id: string): ConversationMessage {
  return {
    id,
    role: "user",
    text: "현재 캘린더에 아무런 일정 넣어봐줘",
  };
}
