import { describe, expect, test } from "vitest";

import { createSitePayload } from "../src/site-payload.js";

describe("site payload detection", () => {
  test("classifies arXiv abstract and PDF pages as paper contexts", () => {
    expect(
      createSitePayload({
        title: "Attention Is All You Need",
        url: "https://arxiv.org/abs/1706.03762",
      }),
    ).toMatchObject({
      platform: "arxiv",
      arxivId: "1706.03762",
      title: "Attention Is All You Need",
    });

    expect(
      createSitePayload({
        title: "1706.03762.pdf",
        url: "https://arxiv.org/pdf/1706.03762",
      }),
    ).toMatchObject({
      platform: "arxiv",
      arxivId: "1706.03762",
    });
  });

  test("classifies direct web PDF URLs as document contexts", () => {
    expect(
      createSitePayload({
        title: "paper.pdf",
        url: "https://example.org/research/paper.pdf",
      }),
    ).toMatchObject({
      platform: "pdf-document",
      filename: "paper.pdf",
      title: "paper.pdf",
    });
  });

  test("classifies known work sites without matching lookalike hostnames", () => {
    expect(
      createSitePayload({
        title: "Inbox",
        url: "https://mail.naver.com/v2/folders/0",
      }),
    ).toMatchObject({
      platform: "korean-mail",
      host: "mail.naver.com",
    });

    expect(
      createSitePayload({
        title: "Looks like mail",
        url: "https://evilmail.naver.com.example.test",
      }),
    ).toBeNull();
  });
});
