const BRIDGE_IMAGE_ASSET_PREFIX = "codex-asset:";
const IMAGE_ASSET_CHUNK_BYTES = 256 * 1024;
const BINARY_STRING_CHUNK_SIZE = 32 * 1024;

export interface ImageAssetReadMessage {
  type: "image.asset.read";
  previewRef: string;
  offset: number;
  length: number;
}

export interface ImageAssetReadResult {
  dataBase64: string;
  mimeType: string;
  sizeBytes: number;
  offset: number;
  nextOffset: number;
  done: boolean;
}

type SendRuntimeMessage = (message: ImageAssetReadMessage) => Promise<ImageAssetReadResult>;

const resolvedAssetUrls = new Map<string, string>();

export function isBridgeImageAssetRef(value: string): boolean {
  return value.trim().startsWith(BRIDGE_IMAGE_ASSET_PREFIX);
}

export async function resolveImagePreviewRefForUi(
  previewRef: string,
  sendRuntimeMessage: SendRuntimeMessage,
): Promise<string> {
  const trimmed = previewRef.trim();
  if (!isBridgeImageAssetRef(trimmed)) {
    return trimmed;
  }

  const cached = resolvedAssetUrls.get(trimmed);
  if (cached) {
    return cached;
  }

  let offset = 0;
  let mimeType = "image/png";
  const chunks: Uint8Array[] = [];

  while (true) {
    const chunk = await sendRuntimeMessage({
      type: "image.asset.read",
      previewRef: trimmed,
      offset,
      length: IMAGE_ASSET_CHUNK_BYTES,
    });
    mimeType = chunk.mimeType || mimeType;
    if (chunk.dataBase64) {
      chunks.push(base64ToBytes(chunk.dataBase64));
    }
    offset = chunk.nextOffset;
    if (chunk.done) {
      break;
    }
    if (offset <= chunk.offset || offset > chunk.sizeBytes) {
      throw new Error("Invalid generated image chunk response.");
    }
  }

  const dataUrl = `data:${mimeType};base64,${bytesToBase64(concatBytes(chunks))}`;
  resolvedAssetUrls.set(trimmed, dataUrl);
  return dataUrl;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += BINARY_STRING_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BINARY_STRING_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
