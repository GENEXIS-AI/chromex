import { describe, expect, test, vi } from "vitest";

import { resolveImagePreviewRefForUi } from "../src/sidepanel/image-preview-assets.js";

describe("resolveImagePreviewRefForUi", () => {
  test("materializes bridge image asset refs into reload-safe data URLs through chunked runtime reads", async () => {
    const chunks = [Buffer.from("first").toString("base64"), Buffer.from("second").toString("base64")];
    const sendRuntimeMessage = vi
      .fn()
      .mockResolvedValueOnce({
        dataBase64: chunks[0],
        mimeType: "image/png",
        sizeBytes: 11,
        offset: 0,
        nextOffset: 5,
        done: false,
      })
      .mockResolvedValueOnce({
        dataBase64: chunks[1],
        mimeType: "image/png",
        sizeBytes: 11,
        offset: 5,
        nextOffset: 11,
        done: true,
      });

    await expect(resolveImagePreviewRefForUi("codex-asset:abc", sendRuntimeMessage)).resolves.toBe(
      `data:image/png;base64,${Buffer.from("firstsecond").toString("base64")}`,
    );
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(2);
  });
});
