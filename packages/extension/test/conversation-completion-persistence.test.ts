import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

const backgroundSource = readSource("src/background/index.ts");
const sidepanelSource = readSource("src/sidepanel/index.ts");

describe("conversation completion persistence", () => {
  test("keeps native bridge event subscribers synchronous", () => {
    const subscriberBlock = sourceBetween(
      backgroundSource,
      "bridge.subscribe((event) => {",
      "chrome.runtime.onInstalled.addListener",
    );

    expect(backgroundSource).not.toContain("bridge.subscribe(async");
    expect(subscriberBlock).not.toContain("await getCurrentConversation()");
    expect(subscriberBlock).not.toContain("await persistConversation(");
  });

  test("flushes the visible conversation when terminal assistant events arrive", () => {
    const messageCompletedBlock = sourceBetween(
      sidepanelSource,
      'if (event.type === "message.completed") {',
      'if (event.type === "message.image" && event.previewRef)',
    );
    const turnCompletedBlock = sourceBetween(
      sidepanelSource,
      'if (event.type === "turn.completed" && event.threadId) {',
      'if (event.type === "turn.started" && event.activeTurn)',
    );

    expect(messageCompletedBlock).toContain("scheduleConversationPersist();\n    flushConversationPersist();");
    expect(turnCompletedBlock).toContain("scheduleConversationPersist();\n    flushConversationPersist();");
    expect(sidepanelSource).toContain("let conversationPersistFlushQueue = Promise.resolve();");
    expect(sidepanelSource).toContain("function flushConversationPersist(): void");
    expect(sidepanelSource).toContain(".then(() => persistConversationBatch.flush())");
  });
});
