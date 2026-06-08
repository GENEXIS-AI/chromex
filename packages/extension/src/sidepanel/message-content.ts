import { escapeAttribute, escapeHtml } from "./html-escape.js";
import { renderUiIcon } from "./ui-icons.js";

const TIMESTAMP_PATTERN = /(^|[^\d:])(\d{1,2}:\d{2}(?::\d{2})?)(?![\d:])/gu;
const PLAIN_URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;

export interface RenderMessageContentOptions {
  enableYouTubeTimestampLinks?: boolean;
}

export function isSafeMessageImageUrl(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  if (/^data:image\/[a-z0-9.+-]+;base64,/iu.test(normalized)) {
    return true;
  }
  return /^(?:https?:\/\/|blob:|chrome-extension:\/\/)/iu.test(normalized);
}

function parseSeekTimestamp(value: string): number | null {
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [first = 0, second = 0, third] = parts;
  if (typeof third === "number") {
    if (second > 59 || third > 59) {
      return null;
    }
    return first * 3600 + second * 60 + third;
  }

  if (second > 59) {
    return null;
  }
  return first * 60 + second;
}

const APPROXIMATE_CLOCK_TIME_SUFFIXES = [String.fromCodePoint(0xacbd)];

function hasApproximateClockTimeSuffix(value: string, timestampEndIndex: number): boolean {
  return APPROXIMATE_CLOCK_TIME_SUFFIXES.some((suffix) => value.slice(timestampEndIndex).trimStart().startsWith(suffix));
}

function renderEscapedTextWithTimestamps(value: string, options: RenderMessageContentOptions): string {
  if (!options.enableYouTubeTimestampLinks) {
    return escapeHtml(value).replaceAll("\n", "<br />");
  }

  let lastIndex = 0;
  const parts: string[] = [];

  for (const match of value.matchAll(TIMESTAMP_PATTERN)) {
    const [wholeMatch, prefix = "", timestamp = ""] = match;
    const matchIndex = match.index ?? 0;
    const timestampIndex = matchIndex + prefix.length;
    const seconds = parseSeekTimestamp(timestamp);
    if (seconds === null) {
      continue;
    }
    if (hasApproximateClockTimeSuffix(value, timestampIndex + timestamp.length)) {
      continue;
    }

    parts.push(escapeHtml(value.slice(lastIndex, timestampIndex)));
    parts.push(
      `<button type="button" class="youtube-timestamp-link" data-youtube-seek="${seconds}" title="Seek YouTube to ${escapeHtml(
        timestamp,
      )}">${escapeHtml(timestamp)}</button>`,
    );
    lastIndex = timestampIndex + timestamp.length;
    void wholeMatch;
  }

  parts.push(escapeHtml(value.slice(lastIndex)));
  return parts.join("").replaceAll("\n", "<br />");
}

function isSafeMarkdownLinkUrl(value: string): boolean {
  const normalized = normalizeMarkdownLinkUrl(value);
  return /^(?:https?:\/\/|mailto:)/iu.test(normalized) || getSafeLocalFilePath(normalized) !== null;
}

function formatSafeMarkdownLinkHref(value: string): string {
  const normalized = normalizeMarkdownLinkUrl(value);
  const localFilePath = getSafeLocalFilePath(normalized);
  if (localFilePath) {
    return localFilePathToFileUrl(localFilePath);
  }
  return normalized;
}

function normalizeMarkdownLinkUrl(value: string): string {
  let normalized = value.trim();
  while (
    normalized.length >= 2 &&
    ((normalized.startsWith("<") && normalized.endsWith(">")) ||
      (normalized.startsWith("\"") && normalized.endsWith("\"")) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function getSafeLocalFilePath(value: string): string | null {
  const normalized = normalizeMarkdownLinkUrl(value);
  const localPath = /^file:\/\//iu.test(normalized) ? fileUrlToLocalFilePath(normalized) : normalized;
  if (!localPath || /[\u0000-\u001f\u007f]/u.test(localPath)) {
    return null;
  }
  if (/^\/.+/u.test(localPath) || /^[a-zA-Z]:\\.+/u.test(localPath) || /^\\\\[^\\]+\\[^\\]+/u.test(localPath)) {
    return localPath;
  }
  return null;
}

function fileUrlToLocalFilePath(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") {
      return null;
    }
    const decodedPath = decodeURIComponent(url.pathname);
    if (/^\/[a-zA-Z]:\//u.test(decodedPath)) {
      return decodedPath.slice(1).replaceAll("/", "\\");
    }
    if (url.hostname) {
      return `\\\\${url.hostname}${decodedPath.replaceAll("/", "\\")}`;
    }
    return decodedPath;
  } catch {
    return null;
  }
}

function localFilePathToFileUrl(value: string): string {
  if (/^[a-zA-Z]:\\/u.test(value)) {
    return encodeURI(`file:///${value.replaceAll("\\", "/")}`);
  }
  if (/^\\\\/u.test(value)) {
    return encodeURI(`file://${value.slice(2).replaceAll("\\", "/")}`);
  }
  return encodeURI(`file://${value}`);
}

function renderMarkdownLink(rawUrl: string, label: string, options: RenderMessageContentOptions): string {
  const href = formatSafeMarkdownLinkHref(rawUrl);
  const localFilePath = getSafeLocalFilePath(rawUrl);
  const localFileAttributes = localFilePath
    ? ` data-local-file-path="${escapeAttribute(localFilePath)}" data-local-file-action="reveal"`
    : "";
  return `<a href="${escapeAttribute(href)}"${localFileAttributes} target="_blank" rel="noreferrer noopener">${renderInlineMarkdown(
    label,
    options,
  )}</a>`;
}

function trimPlainUrl(value: string): { url: string; trailing: string } {
  const trailingMatch = value.match(/[.,!?;:)\]}]+$/u);
  if (!trailingMatch?.[0]) {
    return { url: value, trailing: "" };
  }

  const trailing = trailingMatch[0];
  return {
    url: value.slice(0, -trailing.length),
    trailing,
  };
}

function renderEscapedTextWithAutolinks(value: string, options: RenderMessageContentOptions): string {
  let lastIndex = 0;
  const parts: string[] = [];

  for (const match of value.matchAll(PLAIN_URL_PATTERN)) {
    const rawMatch = match[0] ?? "";
    const matchIndex = match.index ?? 0;
    const { url, trailing } = trimPlainUrl(rawMatch);
    if (!url) {
      continue;
    }

    parts.push(renderEscapedTextWithTimestamps(value.slice(lastIndex, matchIndex), options));
    parts.push(
      `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(url)}</a>`,
    );
    parts.push(renderEscapedTextWithTimestamps(trailing, options));
    lastIndex = matchIndex + rawMatch.length;
  }

  parts.push(renderEscapedTextWithTimestamps(value.slice(lastIndex), options));
  return parts.join("");
}

function renderInlineMarkdown(value: string, options: RenderMessageContentOptions): string {
  let index = 0;
  let plain = "";
  const parts: string[] = [];

  const flushPlain = () => {
    if (!plain) {
      return;
    }
    parts.push(renderEscapedTextWithAutolinks(plain, options));
    plain = "";
  };

  while (index < value.length) {
    if (value[index] === "`") {
      const endIndex = value.indexOf("`", index + 1);
      if (endIndex > index + 1) {
        flushPlain();
        parts.push(`<code>${escapeHtml(value.slice(index + 1, endIndex))}</code>`);
        index = endIndex + 1;
        continue;
      }
    }

    if (value.startsWith("**", index) || value.startsWith("__", index)) {
      const marker = value.slice(index, index + 2);
      const endIndex = value.indexOf(marker, index + 2);
      if (endIndex > index + 2) {
        flushPlain();
        parts.push(`<strong>${renderInlineMarkdown(value.slice(index + 2, endIndex), options)}</strong>`);
        index = endIndex + 2;
        continue;
      }
    }

    if (value[index] === "*") {
      const endIndex = value.indexOf("*", index + 1);
      const content = endIndex > index ? value.slice(index + 1, endIndex) : "";
      if (content.trim()) {
        flushPlain();
        parts.push(`<em>${renderInlineMarkdown(content, options)}</em>`);
        index = endIndex + 1;
        continue;
      }
    }

    if (value[index] === "[") {
      const labelEndIndex = value.indexOf("]", index + 1);
      const urlStartIndex = labelEndIndex + 1;
      if (labelEndIndex > index + 1 && value[urlStartIndex] === "(") {
        const urlEndIndex = value.indexOf(")", urlStartIndex + 1);
        const rawUrl = urlEndIndex > urlStartIndex ? value.slice(urlStartIndex + 1, urlEndIndex).trim() : "";
        if (rawUrl && isSafeMarkdownLinkUrl(rawUrl)) {
          flushPlain();
          parts.push(renderMarkdownLink(rawUrl, value.slice(index + 1, labelEndIndex), options));
          index = urlEndIndex + 1;
          continue;
        }
      }
    }

    plain += value[index];
    index += 1;
  }

  flushPlain();
  return parts.join("");
}

function renderMarkdownImages(paragraph: string, options: RenderMessageContentOptions): string {
  const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)\)/giu;
  const matches = Array.from(paragraph.matchAll(imagePattern));
  if (matches.some((match) => !isSafeMessageImageUrl((match[2] ?? "").trim()))) {
    return `<p>${renderInlineMarkdown(paragraph, options)}</p>`;
  }

  let lastIndex = 0;
  const parts: string[] = [];

  for (const match of matches) {
    const [wholeMatch, rawAlt = "", rawUrl = ""] = match;
    const matchIndex = match.index ?? 0;
    const leading = paragraph.slice(lastIndex, matchIndex);
    if (leading) {
      parts.push(`<p>${renderInlineMarkdown(leading.trim(), options)}</p>`);
    }

    const url = rawUrl.trim();
    if (isSafeMessageImageUrl(url)) {
      const alt = rawAlt.trim() || "Generated image";
      parts.push(
        `<figure class="message-image-frame"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" /></figure>`,
      );
    }
    lastIndex = matchIndex + wholeMatch.length;
  }

  const trailing = paragraph.slice(lastIndex);
  if (trailing.trim()) {
    parts.push(`<p>${renderInlineMarkdown(trailing.trim(), options)}</p>`);
  }

  return parts.join("");
}

function splitMarkdownTableRow(line: string): string[] {
  let normalized = line.trim();
  if (normalized.startsWith("|")) {
    normalized = normalized.slice(1);
  }
  if (normalized.endsWith("|") && !normalized.endsWith("\\|")) {
    normalized = normalized.slice(0, -1);
  }

  const cells: string[] = [];
  let current = "";
  let escaped = false;
  let inlineCode = false;

  for (const char of normalized) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "`") {
      inlineCode = !inlineCode;
      current += char;
      continue;
    }
    if (char === "|" && !inlineCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (escaped) {
    current += "\\";
  }
  cells.push(current.trim());
  return cells;
}

function isMarkdownTableSeparatorLine(line: string): boolean {
  const cells = splitMarkdownTableRow(line).filter(Boolean);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.replace(/\s+/gu, "")));
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  const headerLine = lines[index]?.trim() ?? "";
  const separatorLine = lines[index + 1]?.trim() ?? "";
  if (!headerLine.includes("|") || !separatorLine.includes("|")) {
    return false;
  }
  const headers = splitMarkdownTableRow(headerLine).filter((cell) => cell.length > 0);
  return headers.length >= 2 && isMarkdownTableSeparatorLine(separatorLine);
}

function normalizeTableCells(cells: string[], length: number): string[] {
  if (cells.length >= length) {
    return cells.slice(0, length);
  }
  return [...cells, ...Array.from({ length: length - cells.length }, () => "")];
}

function renderMarkdownTable(tableLines: string[], options: RenderMessageContentOptions): string {
  const headers = splitMarkdownTableRow(tableLines[0] ?? "");
  const columnCount = headers.length;
  const bodyLines = tableLines.slice(2);
  const headerHtml = normalizeTableCells(headers, columnCount)
    .map((cell) => `<th>${renderInlineMarkdown(cell, options)}</th>`)
    .join("");
  const bodyHtml = bodyLines
    .map((line) => {
      const cells = normalizeTableCells(splitMarkdownTableRow(line), columnCount)
        .map((cell) => `<td>${renderInlineMarkdown(cell, options)}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<div class="message-table-scroll"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

function isMarkdownBlockStart(line: string): boolean {
  return (
    /^(?:#{1,6})\s+\S/u.test(line) ||
    /^(?:[-*+])\s+\S/u.test(line) ||
    /^\d+[.)]\s+\S/u.test(line) ||
    /^>\s?\S/u.test(line) ||
    /^(?:---|\*\*\*|___)\s*$/u.test(line)
  );
}

function renderParagraph(lines: string[], options: RenderMessageContentOptions): string {
  const paragraph = lines.join("\n").trim();
  if (!paragraph) {
    return "";
  }
  if (paragraph.includes("![")) {
    return renderMarkdownImages(paragraph, options);
  }
  return `<p>${renderInlineMarkdown(paragraph, options)}</p>`;
}

function getOrderedListStart(lines: string[]): number {
  const firstLine = lines.find((line) => line.trim());
  const match = firstLine ? /^(\d+)[.)]\s+\S/u.exec(firstLine.trim()) : null;
  const start = match ? Number.parseInt(match[1] ?? "", 10) : 1;
  return Number.isFinite(start) && start > 0 ? start : 1;
}

function renderList(lines: string[], ordered: boolean, options: RenderMessageContentOptions): string {
  const items = lines
    .map((line) => line.replace(ordered ? /^\d+[.)]\s+/u : /^(?:[-*+])\s+/u, "").trim())
    .filter(Boolean)
    .map((line) => `<li>${renderInlineMarkdown(line, options)}</li>`)
    .join("");
  if (!ordered) {
    return `<ul>${items}</ul>`;
  }
  const start = getOrderedListStart(lines);
  const startAttribute = start === 1 ? "" : ` start="${start}"`;
  return `<ol${startAttribute}>${items}</ol>`;
}

function renderMarkdownBlocks(block: string, options: RenderMessageContentOptions): string {
  const lines = block.split("\n");
  const parts: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/u.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      parts.push(`<h${level}>${renderInlineMarkdown(headingMatch[2] ?? "", options)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(?:---|\*\*\*|___)\s*$/u.test(trimmed)) {
      parts.push("<hr />");
      index += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const tableLines: string[] = [lines[index] ?? "", lines[index + 1] ?? ""];
      index += 2;
      while (index < lines.length) {
        const current = lines[index]?.trim() ?? "";
        if (!current || !current.includes("|")) {
          break;
        }
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      parts.push(renderMarkdownTable(tableLines, options));
      continue;
    }

    if (/^(?:[-*+])\s+\S/u.test(trimmed)) {
      const listLines: string[] = [];
      while (index < lines.length && /^(?:[-*+])\s+\S/u.test((lines[index] ?? "").trim())) {
        listLines.push((lines[index] ?? "").trim());
        index += 1;
      }
      parts.push(renderList(listLines, false, options));
      continue;
    }

    if (/^\d+[.)]\s+\S/u.test(trimmed)) {
      const listLines: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+\S/u.test((lines[index] ?? "").trim())) {
        listLines.push((lines[index] ?? "").trim());
        index += 1;
      }
      parts.push(renderList(listLines, true, options));
      continue;
    }

    if (/^>\s?/u.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/u.test((lines[index] ?? "").trim())) {
        quoteLines.push((lines[index] ?? "").trim().replace(/^>\s?/u, ""));
        index += 1;
      }
      parts.push(`<blockquote>${renderMarkdownBlocks(quoteLines.join("\n"), options)}</blockquote>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (!current.trim()) {
        break;
      }
      if (paragraphLines.length > 0 && isMarkdownTableStart(lines, index)) {
        break;
      }
      if (paragraphLines.length > 0 && isMarkdownBlockStart(current.trim())) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }
    parts.push(renderParagraph(paragraphLines, options));
  }

  return parts.join("");
}

function normalizeCodeLanguage(language: string): string {
  return language.trim().toLowerCase() || "code";
}

function formatCodeLanguageLabel(language: string): string {
  const normalized = normalizeCodeLanguage(language);
  const labels: Record<string, string> = {
    bash: "Bash",
    css: "CSS",
    html: "HTML",
    js: "JavaScript",
    javascript: "JavaScript",
    json: "JSON",
    jsx: "JSX",
    markdown: "Markdown",
    md: "Markdown",
    py: "Python",
    python: "Python",
    sh: "Shell",
    shell: "Shell",
    ts: "TypeScript",
    tsx: "TSX",
    txt: "Text",
    text: "Text",
    yaml: "YAML",
    yml: "YAML",
  };
  return labels[normalized] ?? normalized.replace(/(^|[-_])([a-z0-9])/gu, (_, separator: string, value: string) =>
    `${separator ? " " : ""}${value.toUpperCase()}`,
  );
}

function renderCodeBlock(rawLanguage: string, rawCode: string): string {
  const language = normalizeCodeLanguage(rawLanguage);
  const label = formatCodeLanguageLabel(language);
  const code = rawCode.replace(/\n$/u, "");
  const languageClass = language === "code" ? "" : ` class="language-${escapeHtml(language)}"`;
  return `
    <figure class="message-code-block" data-code-language="${escapeHtml(language)}">
      <figcaption class="message-code-header">
        <span class="message-code-title">
          ${renderUiIcon("code")}
          ${escapeHtml(label)}
        </span>
        <button type="button" class="message-code-copy" data-code-copy="1" title="Copy code" aria-label="Copy code">
          ${renderUiIcon("copy")}
        </button>
      </figcaption>
      <pre><code${languageClass}>${escapeHtml(code)}</code></pre>
    </figure>
  `;
}

export function renderMessageContentHtml(
  text: string | null | undefined,
  options: RenderMessageContentOptions = {},
): string {
  const normalized = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  const parts: string[] = [];
  const lines = normalized.split("\n");
  const textBuffer: string[] = [];
  let index = 0;

  const flushTextBuffer = () => {
    const textBlock = textBuffer.join("\n").trim();
    textBuffer.length = 0;
    if (textBlock) {
      parts.push(renderMarkdownBlocks(textBlock, options));
    }
  };

  while (index < lines.length) {
    const fenceMatch = /^(```|~~~)\s*([a-z0-9_-]+)?\s*$/iu.exec(lines[index] ?? "");
    if (!fenceMatch) {
      textBuffer.push(lines[index] ?? "");
      index += 1;
      continue;
    }

    flushTextBuffer();
    const fenceMarker = fenceMatch[1] ?? "```";
    const rawLanguage = fenceMatch[2] ?? "";
    const codeLines: string[] = [];
    index += 1;
    while (index < lines.length && !new RegExp(`^${fenceMarker}\\s*$`, "u").test(lines[index] ?? "")) {
      codeLines.push(lines[index] ?? "");
      index += 1;
    }
    if (index < lines.length) {
      index += 1;
    }
    parts.push(renderCodeBlock(rawLanguage, codeLines.join("\n")));
  }

  flushTextBuffer();
  return parts.join("");
}
