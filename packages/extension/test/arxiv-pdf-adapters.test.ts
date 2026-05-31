import { describe, expect, test } from "vitest";

import { collectArxivAdapterPayload } from "../src/adapters/arxiv.js";
import { collectPdfAdapterPayload } from "../src/adapters/pdf.js";
import { createGenericSiteFallbackContext } from "../src/background/pdf-page-context.js";

function fakeDocument(selectors: Record<string, string | string[]>): Document {
  return {
    title: "Fallback title",
    querySelector(selector: string) {
      const value = selectors[selector];
      const text = Array.isArray(value) ? value[0] : value;
      return typeof text === "string" ? ({ textContent: text } as Element) : null;
    },
    querySelectorAll(selector: string) {
      const value = selectors[selector];
      const items = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      return items.map((text) => ({ textContent: text })) as unknown as NodeListOf<Element>;
    },
  } as unknown as Document;
}

describe("arXiv and PDF adapters", () => {
  test("extracts arXiv paper metadata from abstract pages", () => {
    const payload = collectArxivAdapterPayload(
      fakeDocument({
        "h1.title": "Title: Attention Is All You Need",
        ".authors a": ["Ashish Vaswani", "Noam Shazeer"],
        "blockquote.abstract": "Abstract: We propose a new simple network architecture, the Transformer.",
        "td.tablecell.subjects": "Computation and Language (cs.CL); Machine Learning (cs.LG)",
      }),
      "https://arxiv.org/abs/1706.03762",
    );

    expect(payload).toMatchObject({
      platform: "arxiv",
      arxivId: "1706.03762",
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani", "Noam Shazeer"],
      abstract: "We propose a new simple network architecture, the Transformer.",
      subjects: ["Computation and Language (cs.CL)", "Machine Learning (cs.LG)"],
    });
  });

  test("describes browser PDF contexts with filename and visible text availability", () => {
    const payload = collectPdfAdapterPayload(
      fakeDocument({
        ".textLayer": "This PDF page discusses evaluation methodology and limitations.",
      }),
      "https://example.org/files/report.pdf",
      "report.pdf",
    );

    expect(payload).toMatchObject({
      platform: "pdf-document",
      filename: "report.pdf",
      hasVisibleTextLayer: true,
    });
  });

  test("creates metadata fallback context for Gmail when DOM collection is unavailable", () => {
    const context = createGenericSiteFallbackContext(
      {
        title: "Important client update - Gmail",
        url: "https://mail.google.com/mail/u/0/#inbox/FMfcgzG",
      },
      "ko-KR",
    );

    expect(context?.readStrategy).toBe("adapter");
    expect(context?.envelope.adapterPayload).toMatchObject({ platform: "gmail" });
    expect(context?.envelope.domSummary).toContain("Gmail");
    expect(context?.actionCards.length).toBeGreaterThan(0);
  });
});
