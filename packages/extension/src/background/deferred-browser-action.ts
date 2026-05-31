import type { AgenticRoutePlan } from "@codex-sidepanel/shared";

export function shouldResumeDeferredBrowserDomAction(plan: AgenticRoutePlan): boolean {
  if (plan.intent.needsClarification) {
    return false;
  }
  if (plan.intent.action !== "navigate" || plan.intent.target !== "current-page") {
    return false;
  }
  if (plan.browserControl.surface !== "active-tab") {
    return false;
  }
  if (plan.browserControl.shouldControl || plan.browserControl.mode !== "dom") {
    return false;
  }
  return Boolean(plan.browserControl.preconditions?.length);
}

export function extractDeferredBrowserActionText(assistantText: string): string {
  const trimmed = assistantText.trim();
  if (!trimmed) {
    return "";
  }

  const fencedBlocks = Array.from(trimmed.matchAll(/```[^\n`]*\n([\s\S]*?)```/gu))
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  if (fencedBlocks.length) {
    return selectLongestTextBlock(fencedBlocks);
  }

  const inlineCodeBlocks = Array.from(trimmed.matchAll(/`([\s\S]*?)`/gu))
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  if (inlineCodeBlocks.length) {
    return selectLongestTextBlock(inlineCodeBlocks);
  }

  return trimmed;
}

export function buildDeferredBrowserActionMessage(params: {
  originalMessage: string;
  generatedText: string;
}): string {
  return [
    "Continue the original browser action on the current page.",
    "Use the generated content as the text to enter into the current page.",
    "Do not submit, post, publish, send, or otherwise finalize unless the original request explicitly requires it.",
    "",
    "Original user request:",
    params.originalMessage.trim(),
    "",
    "Generated content:",
    params.generatedText.trim(),
  ].join("\n");
}

function selectLongestTextBlock(blocks: string[]): string {
  return blocks.reduce((longest, block) => (block.length > longest.length ? block : longest), "");
}
