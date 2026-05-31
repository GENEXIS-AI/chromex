import { describe, expect, test } from "vitest";

import { createExternalImagePreviewUrl } from "../src/sidepanel/external-image-preview.js";

describe("external image preview URLs", () => {
  test("converts data image URLs into blob URLs before opening them in a top-level tab", async () => {
    const createdBlobs: Blob[] = [];
    const revokedUrls: string[] = [];
    const objectUrlApi = {
      createObjectURL(blob: Blob) {
        createdBlobs.push(blob);
        return `blob:generated-preview-${createdBlobs.length}`;
      },
      revokeObjectURL(url: string) {
        revokedUrls.push(url);
      },
    };

    const preview = createExternalImagePreviewUrl(
      `data:image/png;base64,${Buffer.from("image-bytes").toString("base64")}`,
      objectUrlApi,
    );

    expect(preview.url).toBe("blob:generated-preview-1");
    expect(preview.usesObjectUrl).toBe(true);
    expect(createdBlobs).toHaveLength(1);
    expect(createdBlobs[0]?.type).toBe("image/png");
    await expect(createdBlobs[0]?.text()).resolves.toBe("image-bytes");

    preview.revoke();
    preview.revoke();

    expect(revokedUrls).toEqual(["blob:generated-preview-1"]);
  });

  test("keeps already top-level-safe image URLs unchanged", () => {
    const objectUrlApi = {
      createObjectURL() {
        throw new Error("object URL should not be created for safe URLs");
      },
      revokeObjectURL() {
        throw new Error("object URL should not be revoked for safe URLs");
      },
    };

    const preview = createExternalImagePreviewUrl("https://example.com/generated.png", objectUrlApi);

    expect(preview.url).toBe("https://example.com/generated.png");
    expect(preview.usesObjectUrl).toBe(false);
    preview.revoke();
  });
});
