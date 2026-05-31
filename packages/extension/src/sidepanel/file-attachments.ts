import {
  inferUserFileAttachmentKind,
  type UserFileAttachment,
} from "@codex-sidepanel/shared";

export const MAX_FILE_ATTACHMENTS = 6;
export const MAX_FILE_ATTACHMENT_BYTES = 6 * 1024 * 1024;
export const MAX_AUDIO_FILE_ATTACHMENT_BYTES = 32 * 1024 * 1024;
export const MAX_TOTAL_FILE_ATTACHMENT_BYTES = 64 * 1024 * 1024;

export interface PendingAttachmentMeta {
  name: string;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
  sourceUrl?: string;
}

export interface PlannedAttachmentMeta extends PendingAttachmentMeta {
  kind: UserFileAttachment["kind"];
}

export interface AttachmentSelectionPlan {
  accepted: PlannedAttachmentMeta[];
  rejected: string[];
}

export function planAttachmentSelection(
  existing: UserFileAttachment[],
  incoming: PendingAttachmentMeta[],
): AttachmentSelectionPlan {
  const accepted: PlannedAttachmentMeta[] = [];
  const rejected: string[] = [];
  const existingIds = new Set(existing.map((attachment) => createAttachmentFingerprint(attachment)));
  let nextTotalBytes = existing.reduce((sum, attachment) => sum + attachment.sizeBytes, 0);
  let nextCount = existing.length;

  for (const candidate of incoming) {
    const fingerprint = createAttachmentFingerprint(candidate);
    const kind = inferUserFileAttachmentKind(candidate.name, candidate.mimeType);
    const maxFileBytes = getMaxFileAttachmentBytes(kind);
    if (existingIds.has(fingerprint)) {
      rejected.push(`duplicate:${candidate.name}`);
      continue;
    }
    if (candidate.sizeBytes > maxFileBytes) {
      rejected.push(`file-too-large:${candidate.name}`);
      continue;
    }
    if (nextCount >= MAX_FILE_ATTACHMENTS) {
      rejected.push(`too-many:${candidate.name}`);
      continue;
    }
    if (nextTotalBytes + candidate.sizeBytes > MAX_TOTAL_FILE_ATTACHMENT_BYTES) {
      rejected.push(`total-too-large:${candidate.name}`);
      continue;
    }

    accepted.push({
      ...candidate,
      kind,
    });
    nextCount += 1;
    nextTotalBytes += candidate.sizeBytes;
    existingIds.add(fingerprint);
  }

  return { accepted, rejected };
}

function getMaxFileAttachmentBytes(kind: UserFileAttachment["kind"]): number {
  return kind === "audio" ? MAX_AUDIO_FILE_ATTACHMENT_BYTES : MAX_FILE_ATTACHMENT_BYTES;
}

export function createAttachmentFingerprint(input: Pick<UserFileAttachment, "name" | "sizeBytes" | "lastModified">): string {
  if ("sourceUrl" in input && typeof input.sourceUrl === "string" && input.sourceUrl.trim()) {
    return `url::${input.sourceUrl.trim()}`;
  }
  return `${input.name}::${input.sizeBytes}::${input.lastModified}`;
}

export function createFileChipLabel(attachment: Pick<UserFileAttachment, "name" | "kind">): string {
  const prefix =
    attachment.kind === "image"
      ? "image"
      : attachment.kind === "audio"
        ? "audio"
      : attachment.kind === "pdf"
        ? "pdf"
        : attachment.kind === "docx"
          ? "doc"
          : attachment.kind === "spreadsheet"
            ? "sheet"
            : attachment.kind === "binary"
              ? "file"
              : "text";
  return `${prefix}: ${attachment.name}`;
}

export function createImageAttachmentPreviewSrc(
  attachment: Pick<UserFileAttachment, "base64" | "kind" | "mimeType" | "sourceUrl">,
): string {
  if (attachment.kind !== "image") {
    return "";
  }
  if (attachment.base64.trim()) {
    return `data:${attachment.mimeType || "image/png"};base64,${attachment.base64}`;
  }
  return attachment.sourceUrl?.trim() ?? "";
}

export interface DropDataReader {
  getData(type: string): string;
}

const WEB_IMAGE_EXTENSIONS = new Map([
  [".apng", "image/apng"],
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

export function extractWebImageUrlsFromDropData(data: DropDataReader): string[] {
  const urls = [
    ...extractImageUrlsFromHtml(data.getData("text/html")),
    ...extractUrlsFromUriList(data.getData("text/uri-list")),
    ...extractUrlsFromPlainText(data.getData("text/plain")),
  ].filter(isLikelyWebImageUrl);

  return Array.from(new Set(urls));
}

export function createRemoteImageAttachment(url: string, index = 0): UserFileAttachment {
  const safeUrl = url.trim();
  const extension = inferImageExtensionFromUrl(safeUrl);
  const mimeType = extension ? (WEB_IMAGE_EXTENSIONS.get(extension) ?? "image/*") : "image/*";
  const name = inferRemoteImageName(safeUrl, index, extension);
  return {
    id: `web-image-${Date.now()}-${index}`,
    name,
    mimeType,
    sizeBytes: 0,
    lastModified: 0,
    base64: "",
    kind: "image",
    sourceUrl: safeUrl,
  };
}

function extractImageUrlsFromHtml(html: string): string[] {
  if (!html.trim()) {
    return [];
  }

  const urls: string[] = [];
  for (const match of html.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/giu)) {
    if (match[1]) {
      urls.push(decodeHtmlAttribute(match[1]));
    }
  }
  for (const match of html.matchAll(/<source\b[^>]*srcset=["']([^"']+)["'][^>]*>/giu)) {
    urls.push(...extractUrlsFromSrcset(match[1] ?? ""));
  }
  for (const match of html.matchAll(/<img\b[^>]*srcset=["']([^"']+)["'][^>]*>/giu)) {
    urls.push(...extractUrlsFromSrcset(match[1] ?? ""));
  }
  return urls;
}

function extractUrlsFromSrcset(srcset: string): string[] {
  return srcset
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/u)[0] ?? "")
    .filter(Boolean);
}

function extractUrlsFromUriList(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function extractUrlsFromPlainText(value: string): string[] {
  return Array.from(value.matchAll(/https?:\/\/[^\s"'<>]+/giu), (match) => match[0] ?? "");
}

function isLikelyWebImageUrl(value: string): boolean {
  const extension = inferImageExtensionFromUrl(value);
  return Boolean(extension);
}

function inferImageExtensionFromUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    const pathname = url.pathname.toLowerCase();
    for (const extension of WEB_IMAGE_EXTENSIONS.keys()) {
      if (pathname.endsWith(extension)) {
        return extension;
      }
    }
  } catch {
    return "";
  }
  return "";
}

function inferRemoteImageName(value: string, index: number, extension: string): string {
  try {
    const url = new URL(value);
    const rawName = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
    const sanitized = sanitizeFileName(rawName);
    if (sanitized) {
      return sanitized;
    }
  } catch {
    // Fall through to deterministic fallback below.
  }
  return `web-image-${index + 1}${extension || ".png"}`;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/gu, "-").trim().slice(0, 120);
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
