import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sidepanelSource = readFileSync(resolve(process.cwd(), "src/sidepanel/index.ts"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "public/sidepanel.css"), "utf8");

describe("conversation message attachments", () => {
  test("renders sent user images and files as message attachments", () => {
    expect(sidepanelSource).toContain("renderConversationMessageAttachments");
    expect(sidepanelSource).toContain("renderConversationMessageAttachmentImage");
    expect(sidepanelSource).toContain("renderConversationMessageAttachmentFile");
    expect(sidepanelSource).toContain("renderConversationMessageAttachmentFileIcon");
    expect(sidepanelSource).toContain('attachment.kind === "audio" ? renderUiIcon("audio-lines")');
    expect(sidepanelSource).toContain("createConversationMessageAttachments");
    expect(sidepanelSource).toContain("attachments: createConversationMessageAttachments(submittedMessageFileAttachments)");
    expect(sidepanelSource).not.toContain("attachments: createConversationMessageAttachments(nextFileAttachments)");
    expect(styles).toContain(".message-attachments");
    expect(styles).toContain(".message-attachment-image");
    expect(styles).toContain(".message-attachment-file");
  });
});
