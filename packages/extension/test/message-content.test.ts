import { describe, expect, test } from "vitest";

import { renderMessageContentHtml } from "../src/sidepanel/message-content.js";

describe("renderMessageContentHtml", () => {
  test("renders paragraphs and preserves inline line breaks", () => {
    expect(renderMessageContentHtml("first line\nsecond line\n\nthird line")).toBe(
      "<p>first line<br />second line</p><p>third line</p>",
    );
  });

  test("renders fenced code blocks as copyable cards", () => {
    const html = renderMessageContentHtml("before\n\n```markdown\n# Title\n```\n\nafter");

    expect(html).toContain("<p>before</p>");
    expect(html).toContain('<figure class="message-code-block" data-code-language="markdown">');
    expect(html).toContain('<figcaption class="message-code-header">');
    expect(html).toContain('<span class="message-code-title">');
    expect(html).toContain("Markdown");
    expect(html).toContain('class="message-code-copy"');
    expect(html).toContain('data-code-copy="1"');
    expect(html).toContain('<pre><code class="language-markdown"># Title</code></pre>');
    expect(html).toContain("<p>after</p>");
  });

  test("recognizes markdown code fences with extra spacing and mixed casing", () => {
    const html = renderMessageContentHtml("``` Markdown\n# Title\n- item\n```");

    expect(html).toContain('<figure class="message-code-block" data-code-language="markdown">');
    expect(html).toContain("Markdown");
    expect(html).toContain('<pre><code class="language-markdown"># Title\n- item</code></pre>');
  });

  test("renders common markdown syntax in chat messages", () => {
    const html = renderMessageContentHtml(
      [
        "# 제목",
        "",
        "일반 문장과 `inline code`입니다.",
        "",
        "- **굵은 항목**",
        "- [링크](https://example.com)",
        "",
        "> 인용문",
      ].join("\n"),
    );

    expect(html).toContain("<h1>제목</h1>");
    expect(html).toContain("<p>일반 문장과 <code>inline code</code>입니다.</p>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li><strong>굵은 항목</strong></li>");
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noreferrer noopener">링크</a>');
    expect(html).toContain("<blockquote><p>인용문</p></blockquote>");
  });

  test("preserves ordered list numbering when markdown list items are separated by blank lines", () => {
    const html = renderMessageContentHtml(
      [
        "1. 첫 번째",
        "",
        "2. 두 번째",
        "",
        "3. 세 번째",
        "",
        "4. 네 번째",
      ].join("\n"),
    );

    expect(html).toBe(
      '<ol><li>첫 번째</li></ol><ol start="2"><li>두 번째</li></ol><ol start="3"><li>세 번째</li></ol><ol start="4"><li>네 번째</li></ol>',
    );
  });

  test("preserves ordered list start numbers that do not begin at one", () => {
    const html = renderMessageContentHtml("3. 세 번째\n4. 네 번째");

    expect(html).toBe('<ol start="3"><li>세 번째</li><li>네 번째</li></ol>');
  });

  test("renders GitHub-style markdown tables in chat messages", () => {
    const html = renderMessageContentHtml(
      [
        "| 항목 | 설명 | 링크 |",
        "| --- | --- | --- |",
        "| 논문 | **핵심** 요약 | https://arxiv.org/abs/2409.07429 |",
        "| 상태 | `accepted` | [원문](https://example.com/paper) |",
      ].join("\n"),
    );

    expect(html).toContain('<div class="message-table-scroll"><table>');
    expect(html).toContain("<thead><tr><th>항목</th><th>설명</th><th>링크</th></tr></thead>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<td>논문</td>");
    expect(html).toContain("<td><strong>핵심</strong> 요약</td>");
    expect(html).toContain(
      '<td><a href="https://arxiv.org/abs/2409.07429" target="_blank" rel="noreferrer noopener">https://arxiv.org/abs/2409.07429</a></td>',
    );
    expect(html).toContain("<td><code>accepted</code></td>");
    expect(html).toContain(
      '<td><a href="https://example.com/paper" target="_blank" rel="noreferrer noopener">원문</a></td>',
    );
  });

  test("does not treat ordinary pipe text as a markdown table without a separator row", () => {
    const html = renderMessageContentHtml("A | B\nC | D");

    expect(html).not.toContain("<table>");
    expect(html).toBe("<p>A | B<br />C | D</p>");
  });

  test("autolinks plain https URLs in chat messages", () => {
    const html = renderMessageContentHtml("논문 링크: https://arxiv.org/abs/2409.07429");

    expect(html).toContain(
      '<a href="https://arxiv.org/abs/2409.07429" target="_blank" rel="noreferrer noopener">https://arxiv.org/abs/2409.07429</a>',
    );
  });

  test("renders local PDF markdown links so generated files can be opened from chat", () => {
    const html = renderMessageContentHtml("PDF: [slides.pdf](</Users/test/Generated Images/slides.pdf>)");

    expect(html).toContain('href="file:///Users/test/Generated%20Images/slides.pdf"');
    expect(html).toContain('data-local-file-path="/Users/test/Generated Images/slides.pdf"');
    expect(html).toContain('data-local-file-action="reveal"');
    expect(html).toContain(">slides.pdf</a>");
  });

  test("keeps trailing sentence punctuation outside autolinked URLs", () => {
    const html = renderMessageContentHtml("참고: https://arxiv.org/abs/2409.07429.");

    expect(html).toContain(
      '<a href="https://arxiv.org/abs/2409.07429" target="_blank" rel="noreferrer noopener">https://arxiv.org/abs/2409.07429</a>.',
    );
    expect(html).not.toContain('href="https://arxiv.org/abs/2409.07429."');
  });

  test("labels code blocks without a language as Code", () => {
    const html = renderMessageContentHtml("```\nplain text\n```");

    expect(html).toContain('data-code-language="code"');
    expect(html).toContain("Code");
    expect(html).toContain("<pre><code>plain text</code></pre>");
  });

  test("renders safe markdown image references as chat previews", () => {
    const html = renderMessageContentHtml("edited\n\n![Edited image](data:image/png;base64,abc123)\n\ndone");

    expect(html).toContain('<figure class="message-image-frame">');
    expect(html).toContain('<img src="data:image/png;base64,abc123" alt="Edited image" loading="lazy" />');
    expect(html).toContain("<p>edited</p>");
    expect(html).toContain("<p>done</p>");
  });

  test("does not render unsafe markdown image URLs", () => {
    const html = renderMessageContentHtml("![bad](javascript:alert(1))");

    expect(html).not.toContain("<img");
    expect(html).toContain("![bad](javascript:alert(1))");
  });

  test("does not render ordinary time references as YouTube seek buttons by default", () => {
    const html = renderMessageContentHtml("검색 기록에서는 16:47경 이 페이지를 봤습니다.");

    expect(html).not.toContain('class="youtube-timestamp-link"');
    expect(html).not.toContain("data-youtube-seek");
    expect(html).toContain("16:47경");
  });

  test("renders YouTube-style timestamps as safe seek buttons when YouTube context is enabled", () => {
    const html = renderMessageContentHtml("핵심 장면은 1:23, 결론은 01:02:03에 나옵니다.", {
      enableYouTubeTimestampLinks: true,
    });

    expect(html).toContain('class="youtube-timestamp-link"');
    expect(html).toContain('data-youtube-seek="83"');
    expect(html).toContain('data-youtube-seek="3723"');
    expect(html).toContain(">1:23</button>");
    expect(html).toContain(">01:02:03</button>");
  });

  test("does not render approximate clock-time suffixes as seek buttons even in YouTube context", () => {
    const html = renderMessageContentHtml("검색 기록에서는 16:47경 이 페이지를 봤습니다.", {
      enableYouTubeTimestampLinks: true,
    });

    expect(html).not.toContain('class="youtube-timestamp-link"');
    expect(html).not.toContain("data-youtube-seek");
    expect(html).toContain("16:47경");
  });

  test("treats missing legacy message text as empty content", () => {
    expect(renderMessageContentHtml(undefined as never)).toBe("");
  });
});
