import { describe, expect, test } from "vitest";

import { getDroppedFiles, hasComposerDropPayload } from "../src/sidepanel/composer-drop.js";

describe("composer drag and drop", () => {
  test("accepts Chrome local file drags before files are exposed on drop", () => {
    expect(
      hasComposerDropPayload({
        files: { length: 0 },
        types: ["Files"],
      }),
    ).toBe(true);
  });

  test("extracts image files from DataTransferItemList when DataTransfer.files is empty", () => {
    const image = new File(["image-bytes"], "mockup.png", { type: "image/png", lastModified: 1 });

    expect(
      getDroppedFiles({
        files: { length: 0 },
        items: [
          {
            kind: "file",
            getAsFile: () => image,
          },
        ],
      }),
    ).toEqual([image]);
  });
});
