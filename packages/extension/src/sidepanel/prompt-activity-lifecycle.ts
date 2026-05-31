import type { CodexActiveTurn } from "@codex-sidepanel/shared";

import type { PromptActivityPhase, PromptActivityState } from "./prompt-activity.js";

const IMAGE_WORKFLOW_PHASES = new Set<PromptActivityPhase>([
  "preparing-image",
  "editing-image",
  "rendering-image-preview",
]);

export function getEffectivePromptActivityForActiveWork(input: {
  current: PromptActivityState | null;
  activeTurn: CodexActiveTurn | null;
  streamingAssistantMessageIds?: ReadonlySet<string> | undefined;
}): PromptActivityState | null {
  if (input.current) {
    return input.current;
  }

  if (input.activeTurn?.turnId) {
    return {
      clientRequestId: `turn:${input.activeTurn.turnId}`,
      phase: "responding",
    };
  }

  const streamingMessageId = input.streamingAssistantMessageIds?.values().next().value;
  if (streamingMessageId) {
    return {
      clientRequestId: `stream:${streamingMessageId}`,
      phase: "responding",
    };
  }

  return null;
}

export function promotePromptActivityForAssistantProgress(input: {
  current: PromptActivityState | null;
  activeTurn: CodexActiveTurn | null;
}): PromptActivityState | null {
  if (input.current) {
    if (IMAGE_WORKFLOW_PHASES.has(input.current.phase)) {
      return input.current;
    }
    if (input.current.phase === "responding") {
      return input.current;
    }
    return {
      ...input.current,
      phase: "responding",
    };
  }

  if (!input.activeTurn?.turnId) {
    return null;
  }

  return {
    clientRequestId: `turn:${input.activeTurn.turnId}`,
    phase: "responding",
  };
}

export function promotePromptActivityForTurnActivity(input: {
  current: PromptActivityState | null;
  activeTurn: CodexActiveTurn | null;
  kind?: string | undefined;
  status?: "running" | "completed" | undefined;
}): PromptActivityState | null {
  if (input.status === "completed" && input.kind !== "image") {
    return input.current;
  }

  if (input.kind === "image") {
    const clientRequestId = input.current?.clientRequestId || createTurnScopedClientRequestId(input.activeTurn);
    if (!clientRequestId) {
      return input.current;
    }
    return {
      clientRequestId,
      phase: input.status === "completed" ? "rendering-image-preview" : "editing-image",
    };
  }

  return promotePromptActivityForAssistantProgress({
    current: input.current,
    activeTurn: input.activeTurn,
  });
}

export function shouldClearPromptActivityOnMessageCompleted(input: {
  current: PromptActivityState | null;
  activeTurn: CodexActiveTurn | null;
}): boolean {
  if (!input.current || IMAGE_WORKFLOW_PHASES.has(input.current.phase)) {
    return false;
  }
  return !input.activeTurn?.turnId;
}

export function shouldClearPromptActivityOnTurnCompleted(input: {
  current: PromptActivityState | null;
  activeTurn: CodexActiveTurn | null;
  completedTurnId?: string | undefined;
}): boolean {
  if (!input.current) {
    return false;
  }
  if (input.current.phase !== "reconnecting") {
    return true;
  }
  return !input.activeTurn?.turnId || input.activeTurn.turnId === input.completedTurnId;
}

function createTurnScopedClientRequestId(activeTurn: CodexActiveTurn | null): string {
  return activeTurn?.turnId ? `turn:${activeTurn.turnId}` : "";
}
