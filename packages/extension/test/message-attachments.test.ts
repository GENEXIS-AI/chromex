import { describe, expect, test } from "vitest";

import { createConversationMessageAttachments } from "../src/sidepanel/message-attachments.js";

describe("conversation message attachment snapshots", () => {
  test("creates image previews without storing unrelated file contents", () => {
    const attachments = createConversationMessageAttachments([
      {
        id: "file-1",
        name: "reference.png",
        mimeType: "image/png",
        sizeBytes: 1200,
        lastModified: 1,
        base64: "abc123",
        kind: "image",
      },
      {
        id: "file-2",
        name: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2400,
        lastModified: 2,
        base64: "pdf-base64-should-not-preview",
        kind: "pdf",
      },
      {
        id: "file-3",
        name: "voice-note.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: 3600,
        lastModified: 3,
        base64: "audio-base64-should-not-preview",
        kind: "audio",
      },
    ]);

    expect(attachments).toMatchObject([
      {
        id: "file-1",
        previewSrc: "data:image/png;base64,abc123",
      },
      {
        id: "file-2",
        kind: "pdf",
      },
      {
        id: "file-3",
        kind: "audio",
        name: "voice-note.mp3",
      },
    ]);
    expect(attachments[1]?.previewSrc).toBeUndefined();
    expect(attachments[2]?.previewSrc).toBeUndefined();
  });

  test("marks generated follow-up image as target and new uploads as references", () => {
    const attachments = createConversationMessageAttachments([
      {
        id: "generated-followup-1",
        name: "previous-result.png",
        mimeType: "image/png",
        sizeBytes: 1200,
        lastModified: 1,
        base64: "target",
        kind: "image",
      },
      {
        id: "file-reference-1",
        name: "new-reference.png",
        mimeType: "image/png",
        sizeBytes: 1400,
        lastModified: 2,
        base64: "reference",
        kind: "image",
      },
    ]);

    expect(attachments).toMatchObject([
      {
        id: "generated-followup-1",
        role: "target",
      },
      {
        id: "file-reference-1",
        role: "reference",
      },
    ]);
  });
});
