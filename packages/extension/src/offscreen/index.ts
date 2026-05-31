import type { EditablePageImageCandidate } from "../page-image-target.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") {
    return false;
  }
  if (message.type !== "offscreen.image.crop") {
    sendResponse({ error: `Unknown offscreen message type: ${String(message.type ?? "")}` });
    return true;
  }
  void cropVisibleTabDataUrlToImageCandidate(message.dataUrl, message.candidate)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        error: error instanceof Error ? error.message : "Unknown offscreen crop failure",
      });
    });
  return true;
});

async function cropVisibleTabDataUrlToImageCandidate(
  dataUrl: unknown,
  candidate: unknown,
): Promise<{ base64: string; mimeType: string; filename: string } | { error: string }> {
  const normalizedDataUrl = typeof dataUrl === "string" ? dataUrl.trim() : "";
  const normalizedCandidate = normalizeEditablePageImageCandidate(candidate);
  if (!normalizedDataUrl || !normalizedCandidate?.viewportRect) {
    return { error: "Missing image crop inputs." };
  }

  const image = await loadImage(normalizedDataUrl);
  const crop = getVisibleImageCropRect(normalizedCandidate, image.naturalWidth || image.width, image.naturalHeight || image.height);
  if (!crop) {
    return { error: "Could not resolve a visible crop rectangle." };
  }

  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return { error: "Could not create an offscreen 2D context." };
  }
  context.drawImage(image, crop.left, crop.top, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
  if (!blob) {
    return { error: "Could not encode the cropped image." };
  }
  return {
    base64: await blobToBase64(blob),
    mimeType: "image/jpeg",
    filename: "visible-page-image.jpg",
  };
}

function normalizeEditablePageImageCandidate(value: unknown): EditablePageImageCandidate | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as EditablePageImageCandidate;
  if (!input.viewportRect || !input.viewportWidth || !input.viewportHeight) {
    return null;
  }
  return input;
}

function getVisibleImageCropRect(
  candidate: EditablePageImageCandidate,
  bitmapWidth: number,
  bitmapHeight: number,
): { left: number; top: number; width: number; height: number } | null {
  const rect = candidate.viewportRect;
  const viewportWidth = candidate.viewportWidth ?? 0;
  const viewportHeight = candidate.viewportHeight ?? 0;
  if (!rect || viewportWidth <= 0 || viewportHeight <= 0) {
    return null;
  }

  const cssLeft = clampNumber(rect.left, 0, viewportWidth);
  const cssTop = clampNumber(rect.top, 0, viewportHeight);
  const cssRight = clampNumber(rect.left + rect.width, 0, viewportWidth);
  const cssBottom = clampNumber(rect.top + rect.height, 0, viewportHeight);
  if (cssRight - cssLeft < 24 || cssBottom - cssTop < 24) {
    return null;
  }

  const scaleX = bitmapWidth / viewportWidth;
  const scaleY = bitmapHeight / viewportHeight;
  const left = Math.max(0, Math.floor(cssLeft * scaleX));
  const top = Math.max(0, Math.floor(cssTop * scaleY));
  const right = Math.min(bitmapWidth, Math.ceil(cssRight * scaleX));
  const bottom = Math.min(bitmapHeight, Math.ceil(cssBottom * scaleY));
  const width = right - left;
  const height = bottom - top;
  return width > 0 && height > 0 ? { left, top, width, height } : null;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load captured tab image."));
    image.src = dataUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read the cropped image blob."));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      resolve(dataUrl.split(",", 2)[1] ?? "");
    };
    reader.readAsDataURL(blob);
  });
}
