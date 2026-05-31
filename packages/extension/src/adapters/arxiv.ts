export interface ArxivAdapterPayload extends Record<string, unknown> {
  platform: "arxiv";
  title: string;
  arxivId: string;
  authors: string[];
  abstract: string;
  subjects: string[];
  absUrl: string;
  pdfUrl: string;
  htmlUrl: string;
}

type QueryableDocument = Pick<Document, "querySelector" | "querySelectorAll" | "title">;

export function isArxivUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) {
    return false;
  }
  const hostname = parsed.hostname.replace(/^www\./iu, "").toLowerCase();
  return hostname === "arxiv.org" && extractArxivIdFromUrl(url) !== "";
}

export function collectArxivAdapterPayload(
  documentRef: QueryableDocument = document,
  url: string = window.location.href,
): ArxivAdapterPayload {
  const arxivId = extractArxivIdFromUrl(url);
  const title = cleanArxivField(
    firstText(documentRef, [
      "h1.title",
      ".ltx_title",
      "h1",
      "meta[name='citation_title']",
    ]) || cleanArxivTitle(documentRef.title),
    ["Title:"],
  );
  const authors = extractAuthors(documentRef);
  const abstract = cleanArxivField(
    firstText(documentRef, [
      "blockquote.abstract",
      ".ltx_abstract",
      "section.abstract",
      "[data-testid='abstract']",
    ]),
    ["Abstract:"],
  );
  const subjects = splitList(
    cleanArxivField(
      firstText(documentRef, [
        "td.tablecell.subjects",
        ".subjects",
        ".subheader",
      ]),
      ["Subjects:"],
    ),
    /;|,/u,
  );

  return {
    platform: "arxiv",
    title: title || "arXiv paper",
    arxivId,
    authors,
    abstract,
    subjects,
    absUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : url,
    pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}` : url,
    htmlUrl: arxivId ? `https://arxiv.org/html/${arxivId}` : url,
  };
}

export function extractArxivIdFromUrl(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) {
    return "";
  }
  const hostname = parsed.hostname.replace(/^www\./iu, "").toLowerCase();
  if (hostname !== "arxiv.org") {
    return "";
  }

  const match = parsed.pathname.match(/^\/(?:abs|pdf|html|format)\/(.+)$/iu);
  const rawId = decodeURIComponent(match?.[1] ?? "")
    .replace(/\.pdf$/iu, "")
    .replace(/\/$/u, "")
    .trim();
  return rawId;
}

export function cleanArxivTitle(title: string): string {
  return title
    .trim()
    .replace(/\s*\|\s*arxiv(?:\.org)?\s*$/iu, "")
    .replace(/^arxiv:\s*\S+\s*(?:\[[^\]]+\])?\s*/iu, "")
    .replace(/\.pdf$/iu, "")
    .trim();
}

function extractAuthors(documentRef: QueryableDocument): string[] {
  const linkedAuthors = allText(documentRef, [".authors a", ".ltx_authors a", "meta[name='citation_author']"]);
  if (linkedAuthors.length) {
    return linkedAuthors;
  }
  return splitList(cleanArxivField(firstText(documentRef, [".authors", ".ltx_authors"]), ["Authors:"]), /,| and /iu);
}

function firstText(documentRef: QueryableDocument, selectors: string[]): string {
  for (const selector of selectors) {
    const node = documentRef.querySelector(selector);
    const text = readNodeText(node);
    if (text) {
      return text;
    }
  }
  return "";
}

function allText(documentRef: QueryableDocument, selectors: string[]): string[] {
  const values: string[] = [];
  for (const selector of selectors) {
    for (const node of Array.from(documentRef.querySelectorAll(selector))) {
      const text = readNodeText(node);
      if (text) {
        values.push(text);
      }
    }
  }
  return Array.from(new Set(values));
}

function readNodeText(node: Element | null): string {
  if (!node) {
    return "";
  }
  const content = node.getAttribute?.("content");
  return normalizeText(content || node.textContent || "");
}

function cleanArxivField(value: string, prefixes: string[]): string {
  let next = normalizeText(value);
  for (const prefix of prefixes) {
    next = next.replace(new RegExp(`^${escapeRegExp(prefix)}\\s*`, "iu"), "");
  }
  return next.trim();
}

function splitList(value: string, delimiter: RegExp): string[] {
  return value
    .split(delimiter)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
