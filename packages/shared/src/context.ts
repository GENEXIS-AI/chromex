import type { PageContextEnvelope, PromptEnvelope, ProfileTemplate, RawPageCapture, VisionAsset } from "./types.js";

const DOM_SUMMARY_TRANSPORT_LIMIT = 240_000;

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function summarizeDomText(bodyText: string): string {
  const cleaned = cleanText(bodyText);
  if (cleaned.length <= DOM_SUMMARY_TRANSPORT_LIMIT) {
    return cleaned;
  }

  return `${cleaned.slice(0, DOM_SUMMARY_TRANSPORT_LIMIT - 1).trimEnd()}…`;
}

export function normalizePageContext(raw: RawPageCapture): PageContextEnvelope {
  const visionAssets: VisionAsset[] = [];

  if (raw.screenshotRef) {
    visionAssets.push({
      ref: raw.screenshotRef,
      kind: "screenshot" as const,
    });
  }

  for (const image of raw.images.slice(0, 2)) {
    const width = image.width ?? image.naturalWidth;
    const height = image.height ?? image.naturalHeight;
    const asset: VisionAsset = {
      ref: image.url,
      kind: "page-image",
      originUrl: image.url,
    };

    if (typeof width === "number") {
      asset.width = width;
    }

    if (typeof height === "number") {
      asset.height = height;
    }

    visionAssets.push(asset);
  }

  return {
    metadata: raw.metadata,
    selectionText: cleanText(raw.selectedText),
    domSummary: summarizeDomText(raw.bodyText),
    visionAssets,
    adapterPayload: raw.adapterPayload,
    privacyFlags: raw.privacyFlags,
  };
}

export function createPromptEnvelope(
  profile: ProfileTemplate,
  message: string,
  contexts: PageContextEnvelope[],
): PromptEnvelope {
  return {
    profile,
    message: message.trim(),
    contexts,
  };
}
