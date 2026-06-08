import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(__dirname, "../src/sidepanel/index.ts"), "utf8");
const backgroundSource = readFileSync(resolve(__dirname, "../src/background/index.ts"), "utf8");

describe("YouTube seek permissions", () => {
  test("routes timestamp seek through the permission-aware runtime sender", () => {
    expect(sidepanelSource).toContain("function seekYouTubeTimestamp");
    expect(sidepanelSource).toContain('type: "youtube.seek"');
    expect(sidepanelSource).toContain("sendRuntimeMessageWithConfirmation");
  });

  test("delegates timestamp clicks so streamed markdown patches stay seekable", () => {
    expect(sidepanelSource).toContain("function handleYouTubeTimestampClick");
    expect(sidepanelSource).toContain('root.addEventListener("click", handleYouTubeTimestampClick)');
    expect(sidepanelSource).not.toContain('root.querySelectorAll<HTMLButtonElement>("[data-youtube-seek]")');
  });

  test("keeps message-specific YouTube context when patching streamed assistant text", () => {
    const patcherStart = sidepanelSource.indexOf("function patchStreamingAssistantMessageDoms");
    const patcher = sidepanelSource.slice(patcherStart, sidepanelSource.indexOf("function findConversationMessageRow", patcherStart));

    expect(patcher).toContain("shouldRenderYouTubeTimestampLinksForMessage(message)");
    expect(patcher).not.toContain("enableYouTubeTimestampLinks: shouldRenderYouTubeTimestampLinks()");
  });

  test("guards YouTube seek as a page navigation operation in the background", () => {
    expect(backgroundSource).toContain('case "youtube.seek"');
    expect(backgroundSource).toContain('guardAndRun("page.navigate"');
  });
});
