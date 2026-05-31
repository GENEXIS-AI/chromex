import type { ConversationMessage } from "../types.js";
import type { UiLocale } from "./i18n.js";

export interface EmptyAssistantResponseInput {
  messages: ConversationMessage[];
  traceMessageId: string;
  activeUserMessageId?: string | null;
}

export interface ClearEmptyAssistantResponseNoticeInput {
  messages: ConversationMessage[];
  threadId: string;
  turnId: string;
}

export function shouldShowEmptyAssistantResponseNotice(input: EmptyAssistantResponseInput): boolean {
  const traceMessage = input.messages.find((message) => message.id === input.traceMessageId);
  if (traceMessage?.text.trim()) {
    return false;
  }
  if (traceMessage?.plan?.steps.length) {
    return false;
  }

  const anchorIndex = resolveEmptyResponseAnchorIndex(input.messages, input.traceMessageId, input.activeUserMessageId);
  const scopedMessages = anchorIndex >= 0 ? input.messages.slice(anchorIndex + 1) : input.messages;
  if (scopedMessages.some((message) => hasLaterAssistantTurnWork(message, input.traceMessageId))) {
    return false;
  }
  return !scopedMessages.some((message) => hasAssistantResponseContent(message, input.traceMessageId));
}

export function getStructuredInputNamesForEmptyResponseNotice(
  messages: ConversationMessage[],
  activeUserMessageId?: string | null,
): string[] {
  const userMessage = activeUserMessageId
    ? messages.find((message) => message.id === activeUserMessageId && message.role === "user")
    : findLatestUserMessage(messages);
  return Array.from(new Set((userMessage?.structuredInputs ?? []).map((input) => input.name.trim()).filter(Boolean))).slice(0, 3);
}

export function createEmptyAssistantResponseNotice(input: {
  locale: UiLocale;
  structuredInputNames?: string[];
}): string {
  const names = input.structuredInputNames?.filter(Boolean) ?? [];
  const isKorean = input.locale === "ko";
  if (isKorean) {
    const integrationText = names.length ? ` 선택한 연결: ${names.join(", ")}.` : "";
    return `Codex에서 최종 응답을 받지 못했습니다. 도구 실행이나 앱/플러그인 호출은 종료됐지만 assistant 본문이 비어 있습니다.${integrationText} 연결 권한, app-server 도구 노출, 또는 호출 중 오류가 있었는지 확인한 뒤 다시 시도해 주세요.`;
  }

  const integrationText = names.length ? ` Selected integration: ${names.join(", ")}.` : "";
  return `Codex did not return a final assistant response. Tool, app, or plugin work completed, but the assistant body was empty.${integrationText} Check the connection permission, app-server tool exposure, or any runtime error, then try again.`;
}

export function clearEmptyAssistantResponseNotice(input: ClearEmptyAssistantResponseNoticeInput): boolean {
  const traceMessageId = createTurnTraceMessageId(input.threadId, input.turnId);
  const traceMessage = input.messages.find((message) => message.id === traceMessageId && message.role === "assistant");
  if (!traceMessage || !isEmptyAssistantResponseNoticeText(traceMessage.text)) {
    return false;
  }
  traceMessage.text = "";
  return true;
}

export function clearResolvedEmptyAssistantResponseNotices(messages: ConversationMessage[]): boolean {
  let changed = false;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || !isEmptyAssistantResponseNoticeText(message.text)) {
      continue;
    }

    const nextUserIndex = findNextUserMessageIndex(messages, index + 1);
    const trailingMessages = messages.slice(index + 1, nextUserIndex >= 0 ? nextUserIndex : messages.length);
    if (!trailingMessages.some((entry) => hasAssistantResponseContent(entry, message.id) || hasLaterAssistantTurnWork(entry, message.id))) {
      continue;
    }

    message.text = "";
    changed = true;
  }

  return changed;
}

export function isEmptyAssistantResponseNoticeText(text: string): boolean {
  const normalized = text.trim();
  return (
    normalized.startsWith("Codex에서 최종 응답을 받지 못했습니다.") ||
    normalized.startsWith("Codex did not return a final assistant response.")
  );
}

function resolveEmptyResponseAnchorIndex(
  messages: ConversationMessage[],
  traceMessageId: string,
  activeUserMessageId?: string | null,
): number {
  if (activeUserMessageId) {
    const activeIndex = messages.findIndex((message) => message.id === activeUserMessageId);
    if (activeIndex >= 0) {
      return activeIndex;
    }
  }

  const traceIndex = messages.findIndex((message) => message.id === traceMessageId);
  const endIndex = traceIndex >= 0 ? traceIndex : messages.length;
  for (let index = endIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }
  return -1;
}

function hasAssistantResponseContent(message: ConversationMessage, traceMessageId: string): boolean {
  if (message.role !== "assistant" || message.id === traceMessageId) {
    return false;
  }
  if (message.text.trim()) {
    return true;
  }
  return (message.images ?? []).some(
    (image) => image.src || image.assetRef || image.status === "loading" || image.status === "ready" || image.status === "error" || image.status === "deleted",
  );
}

function hasLaterAssistantTurnWork(message: ConversationMessage, traceMessageId: string): boolean {
  return message.role === "assistant" && message.id !== traceMessageId && Boolean(message.trace?.length);
}

function findLatestUserMessage(messages: ConversationMessage[]): ConversationMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message;
    }
  }
  return null;
}

function findNextUserMessageIndex(messages: ConversationMessage[], startIndex: number): number {
  for (let index = startIndex; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }
  return -1;
}

function createTurnTraceMessageId(threadId: string, turnId: string): string {
  return `turn-trace-${threadId}-${turnId}`;
}
