import { extname } from "node:path";

import type { UserFileAttachment } from "@codex-sidepanel/shared";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import readXlsxFile, { readSheetNames, type Row } from "read-excel-file/node";

export interface PreparedUserFileAttachments {
  sections: string[];
  uploadedImages: Array<{
    name: string;
    ref: string;
  }>;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

const MAX_FILE_ATTACHMENTS = 6;
const MAX_FILE_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 12_000;
const MAX_SPREADSHEET_ROWS = 24;
const MAX_SPREADSHEET_COLUMNS = 8;
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = 12_000;
const SUPPORTED_VISUAL_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function prepareUserFileAttachments(
  attachments: UserFileAttachment[],
  options: { fetchImpl?: FetchLike } = {},
): Promise<PreparedUserFileAttachments> {
  if (attachments.length === 0) {
    return {
      sections: [],
      uploadedImages: [],
    };
  }

  if (attachments.length > MAX_FILE_ATTACHMENTS) {
    throw new Error(`Too many attached files. Limit: ${MAX_FILE_ATTACHMENTS}.`);
  }

  const sections: string[] = [];
  const uploadedImages: Array<{ name: string; ref: string }> = [];

  for (const [index, attachment] of attachments.entries()) {
    if (attachment.kind === "image" && isRemoteImageAttachment(attachment)) {
      const remoteImage = await resolveRemoteImageAttachment(attachment, options.fetchImpl);
      if (remoteImage) {
        uploadedImages.push({
          name: attachment.name,
          ref: createDataUrl(remoteImage.mimeType, remoteImage.base64),
        });
      }
      sections.push(
        formatAttachmentSection(index, attachment, {
          handling: remoteImage
            ? "Attached as a fetched remote visual input. Prefer this web image when the user refers to an attached image or uploaded reference."
            : "Remote image metadata only. Chromex could not safely fetch this image as a supported visual input, so do not claim to have inspected its pixels.",
          extractedText: "",
        }),
      );
      continue;
    }

    const buffer = decodeAttachmentBuffer(attachment);

    if (attachment.kind === "image") {
      const visualMimeType = normalizeSupportedVisualImageMimeType(attachment.mimeType, attachment.name);
      if (visualMimeType && isLikelyBase64Payload(attachment.base64) && isSupportedImageBytes(buffer, visualMimeType)) {
        uploadedImages.push({
          name: attachment.name,
          ref: createDataUrl(visualMimeType, attachment.base64),
        });
      }
      sections.push(
        formatAttachmentSection(index, attachment, {
          handling: visualMimeType && isSupportedImageBytes(buffer, visualMimeType)
            ? "Attached separately as an uploaded visual input. Prefer this file when the user refers to an attached image or uploaded reference."
            : "Image metadata only. This file is not a valid supported Codex visual input, so do not claim to have inspected its pixels.",
          extractedText: "",
        }),
      );
      continue;
    }

    if (attachment.kind === "text") {
      sections.push(
        formatAttachmentSection(index, attachment, {
          handling: "Parsed as plain text. Prefer this extracted content over general assumptions.",
          extractedText: truncateText(decodeTextBuffer(buffer)),
        }),
      );
      continue;
    }

    if (attachment.kind === "audio") {
      sections.push(
        formatAttachmentSection(index, attachment, {
          handling:
            "Audio file metadata only. Chromex transcribes supported audio attachments before sending the request; use the transcript in the prompt when present.",
          extractedText: "",
        }),
      );
      continue;
    }

    if (attachment.kind === "pdf") {
      sections.push(
        formatAttachmentSection(index, attachment, {
          handling: "Parsed from PDF text extraction. Preserve citations and note if structure appears incomplete.",
          extractedText: truncateText(await extractPdfText(buffer)),
        }),
      );
      continue;
    }

    if (attachment.kind === "docx") {
      sections.push(
        formatAttachmentSection(index, attachment, {
          handling: "Parsed from DOCX text extraction. Preserve headings and list structure when possible.",
          extractedText: truncateText(await extractDocxText(buffer)),
        }),
      );
      continue;
    }

    if (attachment.kind === "spreadsheet") {
      sections.push(
        formatAttachmentSection(index, attachment, {
          handling:
            "Parsed into a compact spreadsheet summary. Use visible rows and columns as evidence and call out when data may be truncated.",
          extractedText: truncateText(await extractSpreadsheetText(attachment, buffer)),
        }),
      );
      continue;
    }

    sections.push(
      formatAttachmentSection(index, attachment, {
        handling:
          "This binary file was not parsed automatically. Use its name and MIME type only, and ask for a convertible format if the contents are required.",
        extractedText: "",
      }),
    );
  }

  return {
    sections,
    uploadedImages,
  };
}

function isRemoteImageAttachment(attachment: UserFileAttachment): attachment is UserFileAttachment & { sourceUrl: string } {
  const sourceUrl = attachment.sourceUrl?.trim();
  if (!sourceUrl) {
    return false;
  }
  return /^https?:\/\//iu.test(sourceUrl);
}

async function resolveRemoteImageAttachment(
  attachment: UserFileAttachment & { sourceUrl: string },
  fetchImpl: FetchLike | undefined,
): Promise<{ mimeType: string; base64: string } | null> {
  const fetchRemote = fetchImpl ?? globalThis.fetch;
  if (!fetchRemote) {
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchRemote(attachment.sourceUrl, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const responseMimeType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const mimeType = normalizeSupportedVisualImageMimeType(responseMimeType || attachment.mimeType, attachment.name);
    if (!mimeType) {
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_ATTACHMENT_BYTES) {
      return null;
    }
    if (!isSupportedImageBytes(bytes, mimeType)) {
      return null;
    }
    return {
      mimeType,
      base64: bytes.toString("base64"),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSupportedVisualImageMimeType(mimeType: string, filename: string): string | null {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === "image/jpg") {
    return "image/jpeg";
  }
  if (SUPPORTED_VISUAL_IMAGE_MIME_TYPES.has(normalized)) {
    return normalized;
  }
  const extensionMimeType = imageMimeTypeFromFilename(filename);
  return extensionMimeType && SUPPORTED_VISUAL_IMAGE_MIME_TYPES.has(extensionMimeType) ? extensionMimeType : null;
}

function imageMimeTypeFromFilename(filename: string): string | null {
  switch (extname(filename).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return null;
  }
}

function isLikelyBase64Payload(value: string): boolean {
  const normalized = value.replace(/\s+/gu, "");
  return Boolean(normalized) && normalized.length % 4 === 0 && /^[a-z0-9+/]+={0,2}$/iu.test(normalized);
}

function isSupportedImageBytes(buffer: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case "image/png":
      return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/webp":
      return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    default:
      return false;
  }
}

function decodeAttachmentBuffer(attachment: UserFileAttachment): Buffer {
  const buffer = Buffer.from(attachment.base64, "base64");
  if (buffer.byteLength > MAX_FILE_ATTACHMENT_BYTES || attachment.sizeBytes > MAX_FILE_ATTACHMENT_BYTES) {
    throw new Error(`Attached file is too large: ${attachment.name}`);
  }
  return buffer;
}

function formatAttachmentSection(
  index: number,
  attachment: UserFileAttachment,
  details: { handling: string; extractedText: string },
): string {
  const lines = [
    `ATTACHED FILE ${index + 1}`,
    `Name: ${attachment.name}`,
    `Kind: ${attachment.kind}`,
    `Mime Type: ${attachment.mimeType || "(unknown)"}`,
    `Size Bytes: ${attachment.sizeBytes}`,
    `Handling: ${details.handling}`,
  ];

  if (details.extractedText.trim()) {
    lines.push("Extracted Content:", details.extractedText.trim());
  }

  return lines.join("\n");
}

function createDataUrl(mimeType: string, base64: string): string {
  const safeMimeType = mimeType.trim() || "application/octet-stream";
  return `data:${safeMimeType};base64,${base64}`;
}

function decodeTextBuffer(buffer: Buffer): string {
  return normalizeExtractedText(new TextDecoder("utf-8", { fatal: false }).decode(buffer));
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return normalizeExtractedText(result.text ?? "");
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return normalizeExtractedText(result.value ?? "");
}

async function extractSpreadsheetText(attachment: UserFileAttachment, buffer: Buffer): Promise<string> {
  const extension = extname(attachment.name).toLowerCase();
  if (extension === ".csv" || extension === ".tsv") {
    return summarizeDelimitedText(decodeTextBuffer(buffer), extension === ".tsv" ? "\t" : ",");
  }

  if (extension === ".xlsx" || extension === ".xlsm") {
    const sheetNames = (await readSheetNames(buffer)).slice(0, 3);
    const sheetSummaries = await Promise.all(
      sheetNames.map(async (sheetName) => summarizeWorksheet(sheetName, await readXlsxFile(buffer, { sheet: sheetName }))),
    );
    return normalizeExtractedText(sheetSummaries.join("\n\n"));
  }

  return normalizeExtractedText(
    "Structured parsing is limited for this spreadsheet format. Convert it to .xlsx, .csv, or .tsv for higher-fidelity analysis.",
  );
}

function summarizeDelimitedText(text: string, delimiter: string): string {
  const rows = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_SPREADSHEET_ROWS)
    .map((line) => line.split(delimiter).slice(0, MAX_SPREADSHEET_COLUMNS));

  if (rows.length === 0) {
    return "(empty spreadsheet)";
  }

  return rows.map((row) => row.join(" | ")).join("\n");
}

function summarizeWorksheet(sheetName: string, rowsInput: Row[]): string {
  const rows: string[] = [];

  for (const [rowIndex, row] of rowsInput.slice(0, MAX_SPREADSHEET_ROWS).entries()) {
    const cells = row
      .slice(0, MAX_SPREADSHEET_COLUMNS)
      .map((cell) => stringifySpreadsheetCell(cell))
      .filter((value) => value.length > 0);

    if (cells.length > 0) {
      rows.push(`${rowIndex + 1}. ${cells.join(" | ")}`);
    }
  }

  if (rows.length === 0) {
    return `${sheetName}\n(empty sheet)`;
  }

  return `${sheetName}\n${rows.join("\n")}`;
}

function stringifySpreadsheetCell(cell: Row[number] | undefined): string {
  if (cell === null || cell === undefined) {
    return "";
  }

  if (typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") {
    return String(cell);
  }

  if (cell instanceof Date) {
    return cell.toISOString();
  }

  return JSON.stringify(cell);
}

function truncateText(text: string): string {
  if (text.length <= MAX_EXTRACTED_TEXT_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_EXTRACTED_TEXT_CHARS)}\n...[truncated]`;
}

function normalizeExtractedText(text: string): string {
  return text.replace(/\u0000/gu, "").replace(/\r\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}
