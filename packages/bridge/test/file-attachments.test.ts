import { describe, expect, test } from "vitest";

import { prepareUserFileAttachments } from "../src/file-attachments.js";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const XLSX_FIXTURE_BASE64 =
  "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";

describe("prepareUserFileAttachments", () => {
  test("turns uploaded images into local multimodal inputs", async () => {
    const result = await prepareUserFileAttachments([
      {
        id: "file-1",
        name: "design.png",
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
        lastModified: 1,
        base64: PNG_BYTES.toString("base64"),
        kind: "image",
      },
    ]);

    expect(result.uploadedImages).toEqual([
      {
        name: "design.png",
        ref: `data:image/png;base64,${PNG_BYTES.toString("base64")}`,
      },
    ]);
    expect(result.sections[0]).toContain("ATTACHED FILE 1");
    expect(result.sections[0]).toContain("Kind: image");
  });

  test("fetches remote web image attachments before passing them to Codex", async () => {
    const result = await prepareUserFileAttachments([
      {
        id: "web-image-1",
        name: "mockup.png",
        mimeType: "image/png",
        sizeBytes: 0,
        lastModified: 0,
        base64: "",
        sourceUrl: "https://cdn.example.com/mockup.png",
        kind: "image",
      },
    ], {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => PNG_BYTES,
      }),
    });

    expect(result.uploadedImages).toEqual([
      {
        name: "mockup.png",
        ref: `data:image/png;base64,${PNG_BYTES.toString("base64")}`,
      },
    ]);
    expect(result.sections[0]).toContain("Attached as a fetched remote visual input.");
  });

  test("keeps unsupported images as metadata instead of invalid visual inputs", async () => {
    const result = await prepareUserFileAttachments([
      {
        id: "file-1",
        name: "vector.svg",
        mimeType: "image/svg+xml",
        sizeBytes: 11,
        lastModified: 1,
        base64: Buffer.from("<svg></svg>", "utf-8").toString("base64"),
        kind: "image",
      },
    ]);

    expect(result.uploadedImages).toEqual([]);
    expect(result.sections[0]).toContain("Image metadata only.");
    expect(result.sections[0]).toContain("not a valid supported Codex visual input");
  });

  test("does not pass failed remote images as app-server image URLs", async () => {
    const result = await prepareUserFileAttachments([
      {
        id: "web-image-1",
        name: "blocked.png",
        mimeType: "image/png",
        sizeBytes: 0,
        lastModified: 0,
        base64: "",
        sourceUrl: "https://cdn.example.com/blocked.png",
        kind: "image",
      },
    ], {
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        headers: { get: () => "text/html" },
        arrayBuffer: async () => Buffer.from("blocked"),
      }),
    });

    expect(result.uploadedImages).toEqual([]);
    expect(result.sections[0]).toContain("Remote image metadata only.");
    expect(result.sections[0]).toContain("could not safely fetch");
  });

  test("keeps corrupt image bytes as metadata instead of invalid visual inputs", async () => {
    const result = await prepareUserFileAttachments([
      {
        id: "file-1",
        name: "broken.png",
        mimeType: "image/png",
        sizeBytes: 4,
        lastModified: 1,
        base64: Buffer.from("fake", "utf-8").toString("base64"),
        kind: "image",
      },
    ]);

    expect(result.uploadedImages).toEqual([]);
    expect(result.sections[0]).toContain("Image metadata only.");
    expect(result.sections[0]).toContain("not a valid supported Codex visual input");
  });

  test("extracts compact plain-text content", async () => {
    const result = await prepareUserFileAttachments([
      {
        id: "file-1",
        name: "brief.txt",
        mimeType: "text/plain",
        sizeBytes: 18,
        lastModified: 1,
        base64: Buffer.from("alpha\nbeta\ngamma", "utf-8").toString("base64"),
        kind: "text",
      },
    ]);

    expect(result.uploadedImages).toEqual([]);
    expect(result.sections[0]).toContain("Extracted Content:");
    expect(result.sections[0]).toContain("alpha\nbeta\ngamma");
  });

  test("summarizes csv spreadsheets without relying on binary uploads", async () => {
    const result = await prepareUserFileAttachments([
      {
        id: "file-1",
        name: "sheet.csv",
        mimeType: "text/csv",
        sizeBytes: 32,
        lastModified: 1,
        base64: Buffer.from("name,value\nnorth,12\nsouth,9", "utf-8").toString("base64"),
        kind: "spreadsheet",
      },
    ]);

    expect(result.sections[0]).toContain("name | value");
    expect(result.sections[0]).toContain("north | 12");
  });

  test("summarizes xlsx spreadsheets without exceljs", async () => {
    const result = await prepareUserFileAttachments([
      {
        id: "file-1",
        name: "sheet.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: XLSX_FIXTURE_BASE64.length,
        lastModified: 1,
        base64: XLSX_FIXTURE_BASE64,
        kind: "spreadsheet",
      },
    ]);

    expect(result.sections[0]).toContain("Summary");
    expect(result.sections[0]).toContain("1. name | value");
    expect(result.sections[0]).toContain("2. north | 12");
    expect(result.sections[0]).toContain("3. south | 9");
  });

  test("falls back to metadata for opaque binary files", async () => {
    const result = await prepareUserFileAttachments([
      {
        id: "file-1",
        name: "archive.bin",
        mimeType: "application/octet-stream",
        sizeBytes: 12,
        lastModified: 1,
        base64: "AAECAwQFBgcI",
        kind: "binary",
      },
    ]);

    expect(result.uploadedImages).toEqual([]);
    expect(result.sections[0]).toContain("Kind: binary");
    expect(result.sections[0]).toContain("not parsed automatically");
  });
});
