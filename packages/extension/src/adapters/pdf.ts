export interface PdfAdapterPayload extends Record<string, unknown> {
  platform: "pdf-document";
  title: string;
  filename: string;
  sourceUrl: string;
  hasVisibleTextLayer: boolean;
  pageCount: number;
  visibleTextPreview: string;
}

type QueryableDocument = Pick<Document, "querySelector" | "querySelectorAll" | "title">;

const PDF_TEXT_SELECTORS = [
  ".textLayer",
  "[class*='textLayer']",
  "#viewer",
  "#viewerContainer",
  "pdf-viewer",
];

export function isLikelyPdfUrl(url: string, title = ""): boolean {
  const sourceUrl = resolvePdfSourceUrl(url);
  if (sourceUrl && /\.pdf(?:[?#].*)?$/iu.test(sourceUrl)) {
    return true;
  }
  return /\.pdf$/iu.test(title.trim());
}

export function collectPdfAdapterPayload(
  documentRef: QueryableDocument = document,
  url: string = window.location.href,
  title: string = document.title,
): PdfAdapterPayload {
  const sourceUrl = resolvePdfSourceUrl(url) || url;
  const filename = inferPdfFilename(sourceUrl, title);
  const visibleTextPreview = collectVisiblePdfText(documentRef).slice(0, 1_500);
  const pageCount = countPdfPages(documentRef);

  return {
    platform: "pdf-document",
    title: cleanPdfTitle(title, filename),
    filename,
    sourceUrl,
    hasVisibleTextLayer: visibleTextPreview.length > 0,
    pageCount,
    visibleTextPreview,
  };
}

export function resolvePdfSourceUrl(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) {
    return "";
  }
  const embeddedSource = parsed.searchParams.get("src") || parsed.searchParams.get("file");
  if (embeddedSource) {
    try {
      return decodeURIComponent(embeddedSource);
    } catch {
      return embeddedSource;
    }
  }
  return url;
}

export function inferPdfFilename(url: string, title = ""): string {
  const parsed = parseUrl(url);
  const pathname = parsed?.pathname ?? "";
  const fromPath = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "");
  if (fromPath && /\.pdf$/iu.test(fromPath)) {
    return fromPath;
  }
  const cleanedTitle = title.trim();
  if (cleanedTitle && /\.pdf$/iu.test(cleanedTitle)) {
    return cleanedTitle;
  }
  return cleanedTitle || "document.pdf";
}

function collectVisiblePdfText(documentRef: QueryableDocument): string {
  const segments: string[] = [];
  for (const selector of PDF_TEXT_SELECTORS) {
    for (const node of Array.from(documentRef.querySelectorAll(selector))) {
      const text = normalizeText(node.textContent || "");
      if (text) {
        segments.push(text);
      }
    }
  }
  return Array.from(new Set(segments)).join("\n\n").trim();
}

function countPdfPages(documentRef: QueryableDocument): number {
  const pageNodes = [
    ...Array.from(documentRef.querySelectorAll(".page")),
    ...Array.from(documentRef.querySelectorAll("[data-page-number]")),
  ];
  return new Set(pageNodes).size;
}

function cleanPdfTitle(title: string, filename: string): string {
  const cleaned = title.trim().replace(/\s+-\s+PDF\s*$/iu, "").trim();
  return cleaned || filename;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
