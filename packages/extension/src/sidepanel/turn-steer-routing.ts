import type { CodexActiveTurn } from "@codex-sidepanel/shared";

export interface TurnSteerRoutingInput {
  draft: string;
  resetThread?: boolean;
  threadId: string | undefined;
  activeTurn: CodexActiveTurn | null;
  currentWorkActive?: boolean;
  source?: "composer" | "programmatic";
}

export function shouldSendComposerAsTurnSteer(input: TurnSteerRoutingInput): boolean {
  if (input.resetThread || !input.draft.trim()) {
    return false;
  }

  if (input.source === "programmatic") {
    return false;
  }

  if (input.activeTurn?.turnId) {
    return Boolean(input.threadId && input.activeTurn.threadId === input.threadId);
  }

  return false;
}
