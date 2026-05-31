import type { ConversationMessageTraceItem } from "../types.js";

type TraceSummaryStrings = {
  summaryRunning: string;
  summaryDone: string;
  step: string;
  file: string;
  search: string;
  image: string;
  command: string;
  browserStep: string;
  tool: string;
};

type TraceTitleStrings = {
  plan: string;
  webComplete: string;
  webRunning: string;
  fileComplete: string;
  fileRunning: string;
  commandComplete: string;
  commandRunning: string;
  browserComplete: string;
  browserRunning: string;
  imageComplete: string;
  imageRunning: string;
  responseComplete: string;
  responseRunning: string;
  toolComplete: string;
  toolRunning: string;
};

export function getVisibleTraceItems(
  trace: ConversationMessageTraceItem[] | undefined,
  maxItems: number,
): ConversationMessageTraceItem[] {
  return (trace ?? []).slice(-Math.max(0, maxItems));
}

export function shouldOpenMessageTrace(items: ConversationMessageTraceItem[]): boolean {
  return items.some((item) => item.status === "running");
}

export function formatTraceSummary(
  items: ConversationMessageTraceItem[],
  strings: TraceSummaryStrings,
  formatCount: (count: number, label: string) => string,
): string {
  const fileCount = items.filter((item) => item.kind === "file").length;
  const webCount = items.filter((item) => item.kind === "web").length;
  const imageCount = items.filter((item) => item.kind === "image").length;
  const commandCount = items.filter((item) => item.kind === "command").length;
  const browserCount = items.filter((item) => item.kind === "browser").length;
  const toolCount = items.filter((item) => item.kind === "tool").length;
  const running = shouldOpenMessageTrace(items);
  const parts: string[] = [];

  if (fileCount) parts.push(formatCount(fileCount, strings.file));
  if (webCount) parts.push(formatCount(webCount, strings.search));
  if (imageCount) parts.push(formatCount(imageCount, strings.image));
  if (commandCount) parts.push(formatCount(commandCount, strings.command));
  if (browserCount) parts.push(formatCount(browserCount, strings.browserStep));
  if (toolCount) parts.push(formatCount(toolCount, strings.tool));
  return `${parts.length ? parts.join(", ") : formatCount(items.length, strings.step)} ${
    running ? strings.summaryRunning : strings.summaryDone
  }`;
}

export function formatTraceDetail(item: ConversationMessageTraceItem, title: string): string {
  const detail = item.detail.trim();
  if (!detail || detail === item.title.trim() || detail === title || isNoisyTraceText(detail)) {
    return "";
  }
  return detail;
}

export function formatTraceTitle(item: ConversationMessageTraceItem, trace: TraceTitleStrings): string {
  const completed = item.status === "completed";
  const explicitTitle = item.title.trim();
  if (item.kind === "reasoning" && explicitTitle && !isNoisyTraceText(explicitTitle)) {
    return explicitTitle;
  }
  switch (item.kind) {
    case "reasoning":
      return trace.plan;
    case "web":
      return completed ? trace.webComplete : trace.webRunning;
    case "file":
      return completed ? trace.fileComplete : trace.fileRunning;
    case "command":
      return completed ? trace.commandComplete : trace.commandRunning;
    case "browser":
      return completed ? trace.browserComplete : trace.browserRunning;
    case "image":
      return completed ? trace.imageComplete : trace.imageRunning;
    case "response":
      return completed ? trace.responseComplete : trace.responseRunning;
    case "tool":
    default:
      return completed ? trace.toolComplete : trace.toolRunning;
  }
}

export function isNoisyTraceText(value: string): boolean {
  const normalized = value.replace(/\s+/gu, " ").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized === "reviewing the request and planning the next step." ||
    normalized === "preparing the user-facing response." ||
    normalized.includes("without exposing hidden chain-of-thought") ||
    normalized.includes("final answer preparation")
  );
}
