import type { CodexActiveTurn } from "@codex-sidepanel/shared";

export interface AcceptedPromptActiveTurnInput {
  threadId: string;
  turnId: string;
  completedTurnIds: ReadonlySet<string>;
}

export function resolveAcceptedPromptActiveTurn(input: AcceptedPromptActiveTurnInput): CodexActiveTurn | null {
  if (input.completedTurnIds.has(input.turnId)) {
    return null;
  }

  return {
    threadId: input.threadId,
    turnId: input.turnId,
  };
}
