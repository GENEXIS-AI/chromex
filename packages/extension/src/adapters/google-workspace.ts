export type GoogleWorkspacePlatform = "google-docs" | "google-sheets" | "google-slides";

export interface GoogleWorkspaceAdapterPayload extends Record<string, unknown> {
  platform: GoogleWorkspacePlatform;
  title: string;
  fileId: string;
  sourceUrl: string;
  extractionSource: "export" | "dom-fallback" | "unavailable";
  exportCandidates: string[];
  textPreview?: string;
  gid?: string;
  tablePreview?: CsvPreview;
  slides?: SlideTextPreview[];
  extractionError?: string;
}

export interface CsvPreview {
  headers: string[];
  rows: string[][];
  rowCount: number;
  columnCount: number;
}

export interface SlideTextPreview {
  slideNumber: number;
  title: string;
  text: string;
}

type CollectGoogleWorkspaceParams = {
  url: string;
  title: string;
  documentText: string;
  fetchText?: (url: string) => Promise<string>;
};

const MAX_TEXT_PREVIEW_CHARS = 50_000;
const MAX_CSV_ROWS = 80;
const MAX_CSV_COLUMNS = 40;
const MAX_SLIDES = 80;
const HTML_RESPONSE_PATTERN = /^\s*<!doctype html|^\s*<html[\s>]/iu;

export function isGoogleWorkspaceUrl(url: string): boolean {
  return classifyGoogleWorkspaceUrl(url) !== null;
}

export function classifyGoogleWorkspaceUrl(url: string): GoogleWorkspacePlatform | null {
  const parsed = parseUrl(url);
  if (!parsed || parsed.hostname.replace(/^www\./iu, "").toLowerCase() !== "docs.google.com") {
    return null;
  }
  if (parsed.pathname.startsWith("/document/")) {
    return "google-docs";
  }
  if (parsed.pathname.startsWith("/spreadsheets/")) {
    return "google-sheets";
  }
  if (parsed.pathname.startsWith("/presentation/")) {
    return "google-slides";
  }
  return null;
}

export function extractGoogleWorkspaceFileId(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) {
    return "";
  }
  const match = parsed.pathname.match(/\/(?:document|spreadsheets|presentation)\/d\/([^/]+)/u);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export function extractGoogleSheetsGid(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) {
    return "0";
  }
  const hashGid = parsed.hash.match(/gid=(\d+)/u)?.[1];
  const queryGid = parsed.searchParams.get("gid");
  return hashGid || queryGid || "0";
}

export function buildGoogleWorkspaceExportCandidates(
  platform: GoogleWorkspacePlatform,
  fileId: string,
  options: { gid?: string } = {},
): string[] {
  const encodedId = encodeURIComponent(fileId);
  switch (platform) {
    case "google-docs":
      return [`https://docs.google.com/document/d/${encodedId}/export?format=txt`];
    case "google-sheets": {
      const gid = encodeURIComponent(options.gid || "0");
      return [
        `https://docs.google.com/spreadsheets/d/${encodedId}/export?format=csv&gid=${gid}`,
        `https://docs.google.com/spreadsheets/d/${encodedId}/gviz/tq?tqx=out:csv&gid=${gid}`,
      ];
    }
    case "google-slides":
      return [
        `https://docs.google.com/presentation/d/${encodedId}/export/txt`,
        `https://docs.google.com/feeds/download/presentations/Export?id=${encodedId}&exportFormat=txt`,
      ];
  }
}

export async function collectGoogleWorkspaceAdapterPayload(
  params: CollectGoogleWorkspaceParams,
): Promise<GoogleWorkspaceAdapterPayload | null> {
  const platform = classifyGoogleWorkspaceUrl(params.url);
  const fileId = extractGoogleWorkspaceFileId(params.url);
  if (!platform || !fileId) {
    return null;
  }

  const gid = platform === "google-sheets" ? extractGoogleSheetsGid(params.url) : undefined;
  const exportCandidates = buildGoogleWorkspaceExportCandidates(platform, fileId, gid ? { gid } : {});
  const title = cleanGoogleWorkspaceTitle(params.title);
  const fetchText = params.fetchText ?? fetchExportText;
  let exportedText = "";
  let extractionError = "";

  for (const candidate of exportCandidates) {
    try {
      exportedText = sanitizeExportText(await fetchText(candidate));
      if (exportedText) {
        break;
      }
    } catch (error) {
      extractionError = error instanceof Error ? error.message : String(error);
    }
  }

  const payload: GoogleWorkspaceAdapterPayload = {
    platform,
    title,
    fileId,
    sourceUrl: params.url,
    extractionSource: exportedText ? "export" : "unavailable",
    exportCandidates,
  };
  if (gid) {
    payload.gid = gid;
  }
  if (extractionError) {
    payload.extractionError = extractionError.slice(0, 500);
  }

  const sourceText = exportedText || sanitizeExportText(params.documentText);
  if (!sourceText) {
    return payload;
  }

  payload.extractionSource = exportedText ? "export" : "dom-fallback";
  if (platform === "google-sheets") {
    payload.tablePreview = parseCsvPreview(sourceText);
    payload.textPreview = formatCsvPreviewText(payload.tablePreview);
    return payload;
  }
  if (platform === "google-slides") {
    payload.slides = parseSlideTextPreview(sourceText);
    payload.textPreview = payload.slides.map((slide) => `Slide ${slide.slideNumber}: ${slide.text}`).join("\n\n")
      .slice(0, MAX_TEXT_PREVIEW_CHARS);
    return payload;
  }
  payload.textPreview = sourceText.slice(0, MAX_TEXT_PREVIEW_CHARS);
  return payload;
}

export function parseCsvPreview(value: string): CsvPreview {
  const rows = parseCsvRows(value)
    .filter((row) => row.some((cell) => cell.trim()))
    .slice(0, MAX_CSV_ROWS)
    .map((row) => row.slice(0, MAX_CSV_COLUMNS));
  const headers = rows[0] ?? [];
  const bodyRows = rows.slice(1);
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return {
    headers,
    rows: bodyRows,
    rowCount: rows.length,
    columnCount,
  };
}

export function parseSlideTextPreview(value: string): SlideTextPreview[] {
  const blocks = value
    .replace(/\r/gu, "")
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, MAX_SLIDES);
  const sourceBlocks = blocks.length ? blocks : [value.trim()].filter(Boolean);
  return sourceBlocks.map((block, index) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const title = lines[0] ?? `Slide ${index + 1}`;
    return {
      slideNumber: index + 1,
      title,
      text: lines.join("\n").slice(0, 4_000),
    };
  });
}

async function fetchExportText(url: string): Promise<string> {
  const response = await fetch(url, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Google Workspace export failed: ${response.status}`);
  }
  return response.text();
}

function sanitizeExportText(value: string): string {
  const text = value.replace(/\u0000/gu, "").trim();
  if (!text || HTML_RESPONSE_PATTERN.test(text)) {
    return "";
  }
  return text.slice(0, MAX_TEXT_PREVIEW_CHARS);
}

function parseCsvRows(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    const next = value[index + 1] ?? "";
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell.trim());
  rows.push(row);
  return rows;
}

function formatCsvPreviewText(preview: CsvPreview): string {
  const lines = [preview.headers.join(" | ")];
  for (const row of preview.rows.slice(0, 20)) {
    lines.push(row.join(" | "));
  }
  return lines.filter(Boolean).join("\n").slice(0, MAX_TEXT_PREVIEW_CHARS);
}

function cleanGoogleWorkspaceTitle(title: string): string {
  return title
    .trim()
    .replace(/\s+-\s+Google (Docs|Sheets|Slides)$/iu, "")
    .trim();
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
