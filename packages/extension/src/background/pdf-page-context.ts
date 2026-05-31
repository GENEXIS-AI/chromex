import {
  inferActionCards,
  type ActionCard,
  type PageContextEnvelope,
  type ReadStrategy,
  type UserFileAttachment,
} from "@codex-sidepanel/shared";

import { createSitePayload } from "../site-payload.js";

const AUTO_PDF_ATTACHMENT_LIMIT_BYTES = 6 * 1024 * 1024;

type PaperPdfTab = Pick<chrome.tabs.Tab, "title" | "url">;
type FetchPdf = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface PaperPdfContextResult {
  envelope: PageContextEnvelope;
  readStrategy: ReadStrategy;
  actionCards: ActionCard[];
}

export function createPaperPdfFallbackContext(tab: PaperPdfTab, locale = ""): PaperPdfContextResult | null {
  if (!tab.url) {
    return null;
  }

  const adapterPayload = createSitePayload({
    title: tab.title ?? "",
    url: tab.url,
  });
  if (!adapterPayload) {
    return null;
  }
  const platform = typeof adapterPayload.platform === "string" ? adapterPayload.platform : "";
  if (platform !== "arxiv" && platform !== "pdf-document") {
    return null;
  }

  const metadataUrl = tab.url;
  const title = getString(adapterPayload.title) || tab.title || (platform === "arxiv" ? "arXiv paper" : "PDF document");
  const sourceUrl = resolvePaperPdfSourceUrl(tab);
  const envelope: PageContextEnvelope = {
    metadata: {
      url: metadataUrl,
      title,
      domain: parseHostname(metadataUrl),
    },
    selectionText: "",
    domSummary: createPaperPdfFallbackSummary(platform, title, sourceUrl),
    visionAssets: [],
    adapterPayload,
    privacyFlags: {
      containsSensitiveFormData: false,
      userConsentedToHistory: false,
    },
  };

  return {
    envelope,
    readStrategy: "adapter",
    actionCards: inferActionCards({
      readStrategy: "adapter",
      adapterActions: [],
      availableSources: ["current-page"],
      adapterPayload,
      locale,
    }),
  };
}

export function createGenericSiteFallbackContext(tab: PaperPdfTab, locale = ""): PaperPdfContextResult | null {
  if (!tab.url) {
    return null;
  }

  const adapterPayload = createSitePayload({
    title: tab.title ?? "",
    url: tab.url,
  });
  if (!adapterPayload) {
    return null;
  }

  const platform = getString(adapterPayload.platform);
  if (platform === "arxiv" || platform === "pdf-document") {
    return createPaperPdfFallbackContext(tab, locale);
  }

  const title = getString(adapterPayload.title) || tab.title || "Current page";
  const envelope: PageContextEnvelope = {
    metadata: {
      url: tab.url,
      title,
      domain: parseHostname(tab.url),
    },
    selectionText: "",
    domSummary: [
      `Current ${formatPlatformName(platform)} page: ${title}`,
      "Detailed DOM text was not available. Use this site metadata as weak context and avoid inventing message contents, metrics, or private details that were not captured.",
    ].join("\n"),
    visionAssets: [],
    adapterPayload,
    privacyFlags: {
      containsSensitiveFormData: isSensitiveSitePlatform(platform),
      userConsentedToHistory: false,
    },
  };

  return {
    envelope,
    readStrategy: "adapter",
    actionCards: inferActionCards({
      readStrategy: "adapter",
      adapterActions: [],
      availableSources: ["current-page"],
      adapterPayload,
      locale,
    }),
  };
}

export function resolvePaperPdfSourceUrl(tab: PaperPdfTab): string {
  if (!tab.url) {
    return "";
  }

  const adapterPayload = createSitePayload({
    title: tab.title ?? "",
    url: tab.url,
  });
  if (!adapterPayload) {
    return "";
  }
  const platform = typeof adapterPayload.platform === "string" ? adapterPayload.platform : "";
  if (platform === "arxiv") {
    return getString(adapterPayload.pdfUrl);
  }
  if (platform === "pdf-document") {
    return getString(adapterPayload.sourceUrl) || tab.url;
  }
  return "";
}

export async function fetchPaperPdfAttachment(
  tab: PaperPdfTab,
  options: {
    fetchPdf?: FetchPdf;
    now?: () => number;
  } = {},
): Promise<UserFileAttachment | null> {
  const sourceUrl = resolvePaperPdfSourceUrl(tab);
  if (!/^https?:\/\//iu.test(sourceUrl)) {
    return null;
  }

  const fetchPdf = options.fetchPdf ?? fetch;
  const response = await fetchPdf(sourceUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`PDF request failed with HTTP ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > AUTO_PDF_ATTACHMENT_LIMIT_BYTES) {
    throw new Error(`PDF is too large to attach automatically: ${contentLength} bytes.`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > AUTO_PDF_ATTACHMENT_LIMIT_BYTES) {
    throw new Error(`PDF is too large to attach automatically: ${buffer.byteLength} bytes.`);
  }

  return createPaperPdfAttachment(tab, sourceUrl, buffer, options.now?.() ?? Date.now());
}

export function createPaperPdfAttachment(
  tab: PaperPdfTab,
  sourceUrl: string,
  buffer: ArrayBuffer,
  now: number,
): UserFileAttachment {
  const adapterPayload = createSitePayload({
    title: tab.title ?? "",
    url: tab.url ?? sourceUrl,
  });
  const filename = getString(adapterPayload?.filename) || inferFilename(sourceUrl, tab.title ?? "");
  return {
    id: `current-pdf-${stableHash(sourceUrl)}`,
    name: filename,
    mimeType: "application/pdf",
    sizeBytes: buffer.byteLength,
    lastModified: now,
    base64: arrayBufferToBase64(buffer),
    kind: "pdf",
    sourceUrl,
  };
}

export function isSameDocumentAttachment(left: UserFileAttachment, sourceUrl: string): boolean {
  return left.sourceUrl === sourceUrl || left.id === `current-pdf-${stableHash(sourceUrl)}`;
}

function createPaperPdfFallbackSummary(platform: string, title: string, sourceUrl: string): string {
  if (platform === "arxiv") {
    return [
      `Current arXiv paper: ${title}`,
      sourceUrl ? `Paper PDF: ${sourceUrl}` : "",
      "Use the attached PDF text when available. If the PDF text is unavailable, use the arXiv metadata and ask for the PDF or a smaller file only when needed.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Current PDF document: ${title}`,
    sourceUrl ? `PDF source: ${sourceUrl}` : "",
    "Use the attached PDF text when available. If the browser PDF viewer does not expose text, rely on the downloaded PDF attachment rather than guessing from the filename.",
  ]
    .filter(Boolean)
    .join("\n");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }

  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.slice(index, index + chunkSize)));
  }
  return btoa(chunks.join(""));
}

function inferFilename(url: string, title: string): string {
  const parsed = parseUrl(url);
  const pathFilename = parsed ? decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) ?? "") : "";
  if (pathFilename) {
    return pathFilename.endsWith(".pdf") ? pathFilename : `${pathFilename}.pdf`;
  }
  const cleanedTitle = title.trim();
  if (cleanedTitle) {
    return cleanedTitle.endsWith(".pdf") ? cleanedTitle : `${cleanedTitle}.pdf`;
  }
  return "document.pdf";
}

function parseHostname(url: string): string {
  return parseUrl(url)?.hostname ?? "";
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatPlatformName(platform: string): string {
  switch (platform) {
    case "gmail":
      return "Gmail";
    case "korean-mail":
      return "mail";
    case "google-docs":
      return "Google Docs";
    case "google-sheets":
      return "Google Sheets";
    case "google-slides":
      return "Google Slides";
    case "notion":
      return "Notion";
    default:
      return platform || "current";
  }
}

function isSensitiveSitePlatform(platform: string): boolean {
  return new Set(["gmail", "korean-mail", "slack", "google-chat", "teams", "kakaowork", "naver-works"]).has(platform);
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
