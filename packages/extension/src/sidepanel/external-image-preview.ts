export interface ExternalImagePreviewUrl {
  url: string;
  usesObjectUrl: boolean;
  revoke: () => void;
}

type ObjectUrlApi = Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;

const DATA_IMAGE_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/iu;

export function createExternalImagePreviewUrl(src: string, objectUrlApi: ObjectUrlApi = URL): ExternalImagePreviewUrl {
  const trimmed = src.trim();
  const match = DATA_IMAGE_URL_PATTERN.exec(trimmed);
  if (!match?.[1] || !match[2]) {
    return {
      url: src,
      usesObjectUrl: false,
      revoke: () => undefined,
    };
  }

  const objectUrl = objectUrlApi.createObjectURL(createBlobFromBase64(match[2], match[1]));
  let revoked = false;
  return {
    url: objectUrl,
    usesObjectUrl: true,
    revoke: () => {
      if (revoked) {
        return;
      }
      revoked = true;
      objectUrlApi.revokeObjectURL(objectUrl);
    },
  };
}

function createBlobFromBase64(base64: string, mimeType: string): Blob {
  const binary = atob(base64.replace(/\s+/gu, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}
