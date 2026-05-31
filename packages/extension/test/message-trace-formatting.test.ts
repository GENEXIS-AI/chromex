import { describe, expect, test } from "vitest";

import {
  formatTraceDetail,
  formatTraceSummary,
  formatTraceTitle,
  getVisibleTraceItems,
  isNoisyTraceText,
  shouldOpenMessageTrace,
} from "../src/sidepanel/message-trace-formatting.js";
import type { ConversationMessageTraceItem } from "../src/types.js";

describe("message trace formatting", () => {
  test("keeps trace rows in arrival order while showing only the latest rows", () => {
    const items = [
      trace("file", "Read a", "completed", 1),
      trace("web", "Search b", "running", 2),
      trace("tool", "Tool c", "completed", 3),
    ];

    expect(getVisibleTraceItems(items, 2).map((item) => item.id)).toEqual(["2", "3"]);
    expect(shouldOpenMessageTrace(getVisibleTraceItems(items, 2))).toBe(true);
  });

  test("summarizes mixed trace groups with localized counters", () => {
    const summary = formatTraceSummary(
      [
        trace("file", "Read a", "completed", 1),
        trace("file", "Read b", "completed", 2),
        trace("web", "Search c", "running", 3),
        trace("command", "Run d", "completed", 4),
      ],
      traceStrings,
      (count, label) => `${count} ${label}`,
    );

    expect(summary).toBe("2 files, 1 searches, 1 commands exploring");
  });

  test("formats titles from kind and status while preserving useful reasoning titles", () => {
    expect(formatTraceTitle(trace("reasoning", "Reviewing the request and planning the next step.", "running", 1), traceStrings.trace)).toBe(
      "Plan",
    );
    expect(formatTraceTitle(trace("reasoning", "Comparing tab context", "running", 1), traceStrings.trace)).toBe(
      "Comparing tab context",
    );
    expect(formatTraceTitle(trace("web", "query", "completed", 1), traceStrings.trace)).toBe("Web search complete");
    expect(formatTraceTitle(trace("image", "render", "running", 1), traceStrings.trace)).toBe("Working on image");
  });

  test("filters hidden-work placeholders from details", () => {
    const title = "Plan";
    expect(formatTraceDetail(trace("reasoning", title, "Preparing the user-facing response.", "running", 1), title)).toBe("");
    expect(formatTraceDetail(trace("tool", "Tool", "Useful detail", "completed", 1), "Tool result ready")).toBe("Useful detail");
    expect(isNoisyTraceText("Preparing a concise reasoning summary without exposing hidden chain-of-thought.")).toBe(true);
  });
});

const traceStrings = {
  summaryRunning: "exploring",
  summaryDone: "explored",
  step: "steps",
  file: "files",
  search: "searches",
  image: "images",
  command: "commands",
  browserStep: "browser steps",
  tool: "tools",
  trace: {
    plan: "Plan",
    webComplete: "Web search complete",
    webRunning: "Searching the web",
    fileComplete: "File exploration complete",
    fileRunning: "Exploring files",
    commandComplete: "Command complete",
    commandRunning: "Running command",
    browserComplete: "Browser context ready",
    browserRunning: "Inspecting browser context",
    imageComplete: "Image work complete",
    imageRunning: "Working on image",
    responseComplete: "Final answer ready",
    responseRunning: "Writing final answer",
    toolComplete: "Tool result ready",
    toolRunning: "Using tool",
  },
};

function trace(
  kind: ConversationMessageTraceItem["kind"],
  title: string,
  detailOrStatus: string | ConversationMessageTraceItem["status"],
  statusOrIndex: ConversationMessageTraceItem["status"] | number,
  index = 0,
): ConversationMessageTraceItem {
  const hasDetail = statusOrIndex === "running" || statusOrIndex === "completed";
  const status = hasDetail ? statusOrIndex : detailOrStatus;
  const sequence = hasDetail ? index : statusOrIndex;
  return {
    id: String(sequence),
    kind,
    title,
    detail: hasDetail ? String(detailOrStatus) : "",
    status: status as ConversationMessageTraceItem["status"],
    timestampMs: Number(sequence),
  };
}
