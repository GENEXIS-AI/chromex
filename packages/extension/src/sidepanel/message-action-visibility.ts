export function shouldRenderAssistantMessageActions(input: {
  messageId: string;
  promptActivityActive: boolean;
  turnActive: boolean;
  streamingMessageIds: ReadonlySet<string>;
}): boolean {
  return (
    !input.promptActivityActive &&
    !input.turnActive &&
    !input.streamingMessageIds.has(input.messageId)
  );
}
