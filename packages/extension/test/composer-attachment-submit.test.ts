import { describe, expect, test } from "vitest";

import { createSubmittedComposerFileAttachmentState } from "../src/sidepanel/composer-attachment-submit.js";

describe("composer attachment submission", () => {
  test("keeps submitted files in the request snapshot and visible message snapshot but clears composer attachments", () => {
    const image = {
      id: "image-1",
      name: "mockup.png",
      mimeType: "image/png",
      sizeBytes: 128,
      lastModified: 1,
      base64: "ZmFrZQ==",
      kind: "image" as const,
    };
    const generated = {
      id: "generated-1",
      name: "previous.png",
      mimeType: "image/png",
      sizeBytes: 256,
      lastModified: 2,
      base64: "ZmFrZQ==",
      kind: "image" as const,
    };

    expect(createSubmittedComposerFileAttachmentState([image], [generated])).toEqual({
      requestFileAttachments: [image, generated],
      messageFileAttachments: [image],
      composerFileAttachments: [],
    });
  });

  test("does not render generated request-only attachments as newly submitted user previews", () => {
    const generated = {
      id: "generated-followup-1",
      name: "previous.png",
      mimeType: "image/png",
      sizeBytes: 256,
      lastModified: 2,
      base64: "ZmFrZQ==",
      kind: "image" as const,
    };

    expect(createSubmittedComposerFileAttachmentState([], [generated])).toEqual({
      requestFileAttachments: [generated],
      messageFileAttachments: [],
      composerFileAttachments: [],
    });
  });

  test("keeps audio files in the submitted request and visible message snapshots", () => {
    const audio = {
      id: "audio-1",
      name: "meeting.m4a",
      mimeType: "audio/mp4",
      sizeBytes: 256,
      lastModified: 3,
      base64: "ZmFrZQ==",
      kind: "audio" as const,
    };
    const pdf = {
      id: "pdf-1",
      name: "brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 512,
      lastModified: 4,
      base64: "ZmFrZQ==",
      kind: "pdf" as const,
    };

    expect(createSubmittedComposerFileAttachmentState([audio, pdf])).toEqual({
      requestFileAttachments: [audio, pdf],
      messageFileAttachments: [audio, pdf],
      composerFileAttachments: [],
    });
  });
});
