import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  createImageAttachmentPreviewSrc,
  createRemoteImageAttachment,
  createFileChipLabel,
  extractWebImageUrlsFromDropData,
  planAttachmentSelection,
  MAX_AUDIO_FILE_ATTACHMENT_BYTES,
  MAX_FILE_ATTACHMENTS,
  MAX_FILE_ATTACHMENT_BYTES,
  MAX_TOTAL_FILE_ATTACHMENT_BYTES,
} from "../src/sidepanel/file-attachments.js";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const backgroundSource = readFileSync(resolve(process.cwd(), "src/background/index.ts"), "utf8");

function getFunctionSource(source: string, name: string): string {
  const startMatch = new RegExp(`(?:async\\s+)?function\\s+${name}\\b`, "u").exec(source);
  const start = startMatch?.index ?? -1;
  if (start < 0) {
    return "";
  }
  const rest = source.slice(start + 1);
  const nextMatch = /\n(?:async\s+)?function\s+/u.exec(rest);
  return nextMatch ? source.slice(start, start + 1 + nextMatch.index) : source.slice(start);
}

describe("file attachment policy", () => {
  test("accepts supported files until limits are reached", () => {
    const plan = planAttachmentSelection([], [
      {
        name: "mockup.png",
        mimeType: "image/png",
        sizeBytes: 512_000,
        lastModified: 1,
      },
      {
        name: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 720_000,
        lastModified: 2,
      },
    ]);

    expect(plan.rejected).toEqual([]);
    expect(plan.accepted.map((attachment) => attachment.kind)).toEqual(["image", "pdf"]);
  });

  test("accepts uploaded audio files as regular visible attachments", () => {
    const plan = planAttachmentSelection([], [
      {
        name: "meeting.m4a",
        mimeType: "audio/mp4",
        sizeBytes: 512_000,
        lastModified: 3,
      },
      {
        name: "voice-note.wav",
        mimeType: "",
        sizeBytes: 256_000,
        lastModified: 4,
      },
    ]);

    expect(plan.rejected).toEqual([]);
    expect(plan.accepted.map((attachment) => attachment.kind)).toEqual(["audio", "audio"]);
    expect(createFileChipLabel({ name: "meeting.m4a", kind: "audio" })).toBe("audio: meeting.m4a");
  });

  test("allows common audio files to exceed the regular document limit", () => {
    const plan = planAttachmentSelection([], [
      {
        name: "interview.wav",
        mimeType: "application/octet-stream",
        sizeBytes: MAX_FILE_ATTACHMENT_BYTES + 1,
        lastModified: 5,
      },
      {
        name: "voice-note.mp3",
        mimeType: "",
        sizeBytes: MAX_AUDIO_FILE_ATTACHMENT_BYTES,
        lastModified: 6,
      },
    ]);

    expect(plan.rejected).toEqual([]);
    expect(plan.accepted.map((attachment) => attachment.kind)).toEqual(["audio", "audio"]);
  });

  test("rejects audio files that exceed the audio-specific cap", () => {
    const plan = planAttachmentSelection([], [
      {
        name: "too-long.wav",
        mimeType: "audio/wav",
        sizeBytes: MAX_AUDIO_FILE_ATTACHMENT_BYTES + 1,
        lastModified: 7,
      },
    ]);

    expect(plan.accepted).toEqual([]);
    expect(plan.rejected).toEqual(["file-too-large:too-long.wav"]);
  });

  test("rejects duplicates and oversized files", () => {
    const existing = [
      {
        id: "file-1",
        name: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        lastModified: 1,
        base64: "ZmFrZQ==",
        kind: "pdf" as const,
      },
    ];
    const plan = planAttachmentSelection(existing, [
      {
        name: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        lastModified: 1,
      },
      {
        name: "huge.png",
        mimeType: "image/png",
        sizeBytes: MAX_FILE_ATTACHMENT_BYTES + 1,
        lastModified: 2,
      },
    ]);

    expect(plan.accepted).toEqual([]);
    expect(plan.rejected).toEqual(["duplicate:brief.pdf", "file-too-large:huge.png"]);
  });

  test("enforces total upload limits", () => {
    const existing = Array.from({ length: 2 }, (_, index) => ({
      id: `file-${index}`,
      name: `existing-${index}.m4a`,
      mimeType: "audio/mp4",
      sizeBytes: Math.floor(MAX_TOTAL_FILE_ATTACHMENT_BYTES / 2) - 1024,
      lastModified: index,
      base64: "ZmFrZQ==",
      kind: "audio" as const,
    }));

    const plan = planAttachmentSelection(existing, [
      {
        name: "overflow.txt",
        mimeType: "text/plain",
        sizeBytes: 4096,
        lastModified: 99,
      },
    ]);

    expect(plan.accepted).toEqual([]);
    expect(plan.rejected).toEqual(["total-too-large:overflow.txt"]);
  });

  test("formats compact chip labels", () => {
    expect(createFileChipLabel({ name: "design.png", kind: "image" })).toBe("image: design.png");
    expect(createFileChipLabel({ name: "sheet.xlsx", kind: "spreadsheet" })).toBe("sheet: sheet.xlsx");
  });

  test("extracts web image urls from dropped html, uri-list, and plain text", () => {
    const dropData = {
      getData(type: string) {
        if (type === "text/html") {
          return '<img src="https://cdn.example.com/photo.webp"><a href="https://example.com/page">page</a>';
        }
        if (type === "text/uri-list") {
          return "# comment\nhttps://cdn.example.com/photo.webp\nhttps://cdn.example.com/diagram.png";
        }
        if (type === "text/plain") {
          return "https://cdn.example.com/diagram.png";
        }
        return "";
      },
    };

    expect(extractWebImageUrlsFromDropData(dropData)).toEqual([
      "https://cdn.example.com/photo.webp",
      "https://cdn.example.com/diagram.png",
    ]);
  });

  test("creates a remote web image attachment without downloading private bytes into extension storage", () => {
    const attachment = createRemoteImageAttachment("https://cdn.example.com/mockup.png?token=redacted", 2);

    expect(attachment).toMatchObject({
      id: expect.stringMatching(/^web-image-/u),
      name: "mockup.png",
      mimeType: "image/png",
      sizeBytes: 0,
      base64: "",
      kind: "image",
      sourceUrl: "https://cdn.example.com/mockup.png?token=redacted",
    });
  });

  test("uses source urls as composer previews for remote image attachments", () => {
    const attachment = createRemoteImageAttachment("https://cdn.example.com/gallery/mockup.png?token=redacted", 1);

    expect(createImageAttachmentPreviewSrc(attachment)).toBe("https://cdn.example.com/gallery/mockup.png?token=redacted");
  });

  test("installs local file drop handlers on the side panel root", () => {
    expect(sidepanelSource).toContain("function installComposerDropHandlers");
    expect(sidepanelSource).toContain('root.addEventListener("dragover"');
    expect(sidepanelSource).toContain('root.addEventListener("drop"');
    expect(sidepanelSource).toContain("const droppedFiles = getDroppedFiles(dataTransfer)");
    expect(sidepanelSource).toContain("await ingestSelectedFiles(droppedFiles)");
  });

  test("shows selected audio files in the composer before slow file reads finish", () => {
    const ingestBody = getFunctionSource(sidepanelSource, "ingestSelectedFiles");

    expect(ingestBody).toContain("const pendingAttachments: UserFileAttachment[]");
    expect(ingestBody).toContain("state.fileAttachments = [...state.fileAttachments, ...pendingAttachments]");
    expect(ingestBody).toContain("getFileAttachmentReadingStatus(pendingAttachments.length)");
    expect(ingestBody.indexOf("state.fileAttachments = [...state.fileAttachments, ...pendingAttachments]")).toBeLessThan(
      ingestBody.indexOf("await readFileAsBase64(job.file)"),
    );
    expect(ingestBody).toContain("base64: \"\"");
    expect(ingestBody).toContain("state.fileAttachments = state.fileAttachments.map");
  });

  test("adds context-menu images to the composer as attachments without launching image edit", () => {
    const contextMenuHandler = backgroundSource.slice(backgroundSource.indexOf("chrome.contextMenus.onClicked.addListener"));
    const sidepanelTaker = getFunctionSource(sidepanelSource, "takePendingContextMenuImageAttachment");
    const renderFileAttachmentChip = getFunctionSource(sidepanelSource, "renderFileAttachmentChip");

    expect(contextMenuHandler).toContain('info.menuItemId === "edit-codex-image"');
    expect(contextMenuHandler).toContain("const sidePanelOpenPromise = openSidePanelForContextMenu(tab)");
    expect(contextMenuHandler.indexOf("const sidePanelOpenPromise = openSidePanelForContextMenu(tab)")).toBeLessThan(
      contextMenuHandler.indexOf("chrome.storage.session.set"),
    );
    expect(contextMenuHandler).toContain("pendingImageAttachment");
    expect(contextMenuHandler).toContain("imageUrl: info.srcUrl");
    expect(contextMenuHandler).toContain("await sidePanelOpenPromise");
    expect(backgroundSource).toContain("function openSidePanelForContextMenu");
    expect(backgroundSource).toContain("chrome.windows.WINDOW_ID_CURRENT");
    expect(backgroundSource).toContain("chrome.sidePanel.open({ tabId: tab.id })");
    expect(contextMenuHandler).toContain('type: "ui.image-attachment.pending"');
    expect(contextMenuHandler).not.toContain('? "edit-image"');
    expect(contextMenuHandler).not.toContain("if (!tab?.windowId)");
    expect(backgroundSource).not.toContain("lastImageSourceUrl");
    expect(backgroundSource).not.toContain("isFreshClickedImageSource");
    expect(backgroundSource).not.toContain("CLICKED_IMAGE_SOURCE_TTL_MS");
    expect(backgroundSource).toContain('case "image.attachment.pending.take"');
    expect(backgroundSource).toContain("function takePendingImageAttachment");

    expect(sidepanelSource).toContain('message.type === "ui.image-attachment.pending"');
    expect(sidepanelSource).toContain("void takePendingContextMenuImageAttachment();");
    expect(sidepanelSource).toContain("createRemoteImageAttachment");
    expect(sidepanelTaker).toContain('type: "image.attachment.pending.take"');
    expect(sidepanelTaker).toContain("createContextMenuImageAttachment");
    expect(sidepanelTaker).toContain('state.activeView = "chat"');
    expect(sidepanelTaker).toContain("state.fileAttachments =");
    expect(sidepanelTaker).not.toContain("sendPrompt");
    expect(sidepanelTaker).not.toContain("image.edit.start");
    expect(renderFileAttachmentChip).toContain("createImageAttachmentPreviewSrc(attachment)");
    expect(renderFileAttachmentChip).toContain("file-chip-preview static");
  });

  test("queues page context-menu actions until the side panel is open and initialized", () => {
    const contextMenuHandler = backgroundSource.slice(backgroundSource.indexOf("chrome.contextMenus.onClicked.addListener"));
    const actionTaker = getFunctionSource(sidepanelSource, "takePendingContextMenuAction");
    const initialize = getFunctionSource(sidepanelSource, "initialize");

    expect(contextMenuHandler).toContain("const sidePanelOpenPromise = openSidePanelForContextMenu(tab)");
    expect(contextMenuHandler.indexOf("const sidePanelOpenPromise = openSidePanelForContextMenu(tab)")).toBeLessThan(
      contextMenuHandler.indexOf("chrome.storage.session.set"),
    );
    expect(contextMenuHandler).toContain("pendingAction:");
    expect(contextMenuHandler).toContain("await sidePanelOpenPromise");
    expect(contextMenuHandler).toContain('type: "ui.context-menu-action.pending"');
    expect(backgroundSource).toContain('case "context.menu.pending.take"');
    expect(backgroundSource).toContain("function takePendingContextMenuAction");

    expect(sidepanelSource).toContain('message.type === "ui.context-menu-action.pending"');
    expect(sidepanelSource).toContain("void takePendingContextMenuAction();");
    expect(initialize).toContain("void takePendingContextMenuAction();");
    expect(actionTaker).toContain('type: "context.menu.pending.take"');
    expect(actionTaker).toContain("handleActionCard(action)");
  });

  test("clears composer file attachments immediately after creating the submitted request snapshot", () => {
    const sendPromptSource = getFunctionSource(sidepanelSource, "sendPrompt");

    expect(sendPromptSource).toContain("createSubmittedComposerFileAttachmentState");
    expect(sendPromptSource).toContain("submittedComposerFileAttachments = submittedFileAttachmentState.messageFileAttachments");
    expect(sendPromptSource).toContain("state.fileAttachments = submittedFileAttachmentState.composerFileAttachments");
    expect(sendPromptSource.indexOf("state.fileAttachments = submittedFileAttachmentState.composerFileAttachments")).toBeLessThan(
      sendPromptSource.indexOf("await createGeneratedImageFileAttachmentsForPrompt"),
    );
    expect(sendPromptSource.indexOf("state.fileAttachments = submittedFileAttachmentState.composerFileAttachments")).toBeLessThan(
      sendPromptSource.indexOf("state.messages.push"),
    );
    expect(sendPromptSource).toContain("state.fileAttachments = submittedComposerFileAttachments");
  });

  test("flushes the submitted user message before awaiting generated-image follow-up routing", () => {
    const sendPromptSource = getFunctionSource(sidepanelSource, "sendPrompt");
    const userMessagePushIndex = sendPromptSource.indexOf("state.messages.push({");
    const generatedImageRoutingIndex = sendPromptSource.indexOf("await createGeneratedImageFileAttachmentsForPrompt");

    expect(userMessagePushIndex).toBeGreaterThanOrEqual(0);
    expect(generatedImageRoutingIndex).toBeGreaterThanOrEqual(0);
    expect(userMessagePushIndex).toBeLessThan(generatedImageRoutingIndex);
    const renderFlushIndex = sendPromptSource.indexOf("renderSync();", userMessagePushIndex);
    expect(renderFlushIndex).toBeGreaterThanOrEqual(0);
    expect(renderFlushIndex).toBeLessThan(generatedImageRoutingIndex);
  });

  test("skips generated-image follow-up routing for turn steering sends", () => {
    const sendPromptSource = getFunctionSource(sidepanelSource, "sendPrompt");
    const generatedImageRoutingIndex = sendPromptSource.indexOf("await createGeneratedImageFileAttachmentsForPrompt");

    expect(generatedImageRoutingIndex).toBeGreaterThanOrEqual(0);
    expect(sendPromptSource).toContain("const generatedImageAttachments = sendAsTurnSteer");
    expect(sendPromptSource.indexOf("? []", sendPromptSource.indexOf("const generatedImageAttachments = sendAsTurnSteer"))).toBeLessThan(
      generatedImageRoutingIndex,
    );
  });
});
