import { describe, expect, test } from "vitest";

import {
  createPaperPdfFallbackContext,
  fetchPaperPdfAttachment,
  resolvePaperPdfSourceUrl,
} from "../src/background/pdf-page-context.js";

describe("PDF page context", () => {
  test("creates arXiv fallback context and resolves the paper PDF", () => {
    const tab = {
      title: "Attention Is All You Need",
      url: "https://arxiv.org/abs/1706.03762",
    };

    expect(resolvePaperPdfSourceUrl(tab)).toBe("https://arxiv.org/pdf/1706.03762");

    const context = createPaperPdfFallbackContext(tab, "ko-KR");
    expect(context?.readStrategy).toBe("adapter");
    expect(context?.envelope.adapterPayload).toMatchObject({
      platform: "arxiv",
      arxivId: "1706.03762",
    });
    expect(context?.actionCards.map((card) => card.id)).toEqual(
      expect.arrayContaining(["arxiv-paper-summary", "arxiv-method-review"]),
    );
  });

  test("fetches direct PDF pages as bridge-readable file attachments", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]).buffer;
    const attachment = await fetchPaperPdfAttachment(
      {
        title: "paper.pdf",
        url: "https://example.org/paper.pdf",
      },
      {
        now: () => 123,
        fetchPdf: async () =>
          new Response(bytes, {
            status: 200,
            headers: {
              "content-length": "4",
              "content-type": "application/pdf",
            },
          }),
      },
    );

    expect(attachment).toMatchObject({
      name: "paper.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
      lastModified: 123,
      kind: "pdf",
      sourceUrl: "https://example.org/paper.pdf",
    });
    expect(attachment?.base64).toBe("JVBERg==");
  });
});
