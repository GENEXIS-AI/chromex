import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vitest";

import { BridgeImageAssetStore, isBridgeImageAssetRef, resolveGeneratedImageOutputDir } from "../src/image-assets.js";

describe("BridgeImageAssetStore", () => {
  test("serves generated images as chunked local assets instead of native-message data URLs", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-sidepanel-asset-test-"));
    const imagePath = join(tempDir, "large.png");
    const bytes = Buffer.alloc(1_200_000, 7);
    await writeFile(imagePath, bytes);
    const store = new BridgeImageAssetStore();

    const previewRef = await store.registerFile(imagePath);
    const first = await store.read(previewRef, { offset: 0, length: 256_000 });
    const second = await store.read(previewRef, { offset: first.nextOffset, length: 256_000 });

    expect(isBridgeImageAssetRef(previewRef)).toBe(true);
    expect(previewRef.startsWith("data:image/")).toBe(false);
    expect(first.mimeType).toBe("image/png");
    expect(first.sizeBytes).toBe(bytes.length);
    expect(first.done).toBe(false);
    expect(first.dataBase64.length).toBeLessThan(400_000);
    expect(second.offset).toBe(first.nextOffset);
  });

  test("describes the generated image folders for settings UI", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-sidepanel-asset-test-"));
    const store = new BridgeImageAssetStore(Promise.resolve(tempDir));
    await store.registerBase64(Buffer.from("image").toString("base64"), "image/png");

    const snapshot = await store.describeFolders();

    expect(snapshot.rootDir).toBe(tempDir);
    expect(snapshot.latestFolder).toBe(tempDir);
    expect(snapshot.folders).toEqual([tempDir]);
    expect(snapshot.assetCount).toBe(1);
    expect(snapshot.latestAssetPath).toContain(tempDir);
  });

  test("persists remote generated image URLs into the generated image folder", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-sidepanel-remote-asset-test-"));
    const outputDir = join(tempDir, "Generated Images");
    const store = new BridgeImageAssetStore({
      outputDir: () => outputDir,
      fetchImage: async () =>
        new Response(Buffer.from("remote-generated-image"), {
          status: 200,
          headers: { "content-type": "image/webp" },
        }),
    });

    const previewRef = await store.registerRemoteImageUrl("https://example.com/generated.webp");
    const snapshot = await store.describeFolders();
    const asset = await store.read(previewRef);

    expect(isBridgeImageAssetRef(previewRef)).toBe(true);
    expect(snapshot.rootDir).toBe(outputDir);
    expect(snapshot.latestAssetPath).toMatch(/generated-.+\.webp$/u);
    await expect(stat(snapshot.latestAssetPath ?? "")).resolves.toMatchObject({
      size: "remote-generated-image".length,
    });
    expect(asset.mimeType).toBe("image/webp");
  });

  test("includes previously saved generated images when folder metadata is refreshed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-sidepanel-existing-asset-test-"));
    const existingPath = join(tempDir, "generated-existing.png");
    await writeFile(existingPath, Buffer.from("existing-generated-image"));
    const store = new BridgeImageAssetStore(Promise.resolve(tempDir));

    const snapshot = await store.describeFolders();

    expect(snapshot.rootDir).toBe(tempDir);
    expect(snapshot.assetCount).toBe(1);
    expect(snapshot.latestAssetPath).toBe(existingPath);
  });

  test("copies generated files into the configured output folder before serving them", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-sidepanel-asset-test-"));
    const sourcePath = join(tempDir, "codex-output.png");
    const outputDir = join(tempDir, "workspace", ".codex-sidepanel", "generated-images");
    await writeFile(sourcePath, Buffer.from("generated-image"));
    const store = new BridgeImageAssetStore({
      outputDir: async () => outputDir,
    });

    const previewRef = await store.registerFile(sourcePath);
    const snapshot = await store.describeFolders();
    await rm(sourcePath);
    const asset = await store.read(previewRef);

    expect(snapshot.rootDir).toBe(outputDir);
    expect(snapshot.latestFolder).toBe(outputDir);
    expect(snapshot.latestAssetPath).toContain(outputDir);
    expect(dirname(snapshot.latestAssetPath ?? "")).toBe(outputDir);
    await expect(stat(snapshot.latestAssetPath ?? "")).resolves.toMatchObject({ size: "generated-image".length });
    expect(Buffer.from(asset.dataBase64, "base64").toString("utf8")).toBe("generated-image");
  });

  test("restores generated image asset refs from the persisted manifest after bridge restart", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-sidepanel-asset-manifest-test-"));
    const firstStore = new BridgeImageAssetStore(Promise.resolve(tempDir));
    const previewRef = await firstStore.registerBase64(Buffer.from("durable-generated-image").toString("base64"), "image/png");
    const secondStore = new BridgeImageAssetStore(Promise.resolve(tempDir));

    const asset = await secondStore.read(previewRef);

    expect(Buffer.from(asset.dataBase64, "base64").toString("utf8")).toBe("durable-generated-image");
    expect(asset.mimeType).toBe("image/png");
  });

  test("keeps workspace generated images under the workspace with relative platform-safe segments", () => {
    expect(resolveGeneratedImageOutputDir("/workspace/project")).toBe(
      join("/workspace/project", ".codex-sidepanel", "generated-images"),
    );
  });

  test("normalizes quoted and environment-based generated image output folders", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-sidepanel-quoted-image-output-"));
    const outputDir = join(tempDir, "Generated Images");
    const previousEnv = process.env.CODEX_TEST_IMAGE_OUTPUT_DIR;
    process.env.CODEX_TEST_IMAGE_OUTPUT_DIR = outputDir;
    try {
      const store = new BridgeImageAssetStore({
        outputDir: () => "'$env:CODEX_TEST_IMAGE_OUTPUT_DIR'",
      });
      await store.registerBase64(Buffer.from("image").toString("base64"), "image/png");
      const snapshot = await store.describeFolders();

      expect(snapshot.rootDir).toBe(outputDir);
      expect(resolveGeneratedImageOutputDir(`"${tempDir}"`)).toBe(
        join(tempDir, ".codex-sidepanel", "generated-images"),
      );
    } finally {
      if (previousEnv === undefined) {
        delete process.env.CODEX_TEST_IMAGE_OUTPUT_DIR;
      } else {
        process.env.CODEX_TEST_IMAGE_OUTPUT_DIR = previousEnv;
      }
    }
  });

  test("deletes only registered generated image assets by preview ref", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-sidepanel-asset-delete-test-"));
    const store = new BridgeImageAssetStore(Promise.resolve(tempDir));
    const previewRef = await store.registerBase64(Buffer.from("generated-image").toString("base64"), "image/png");
    const before = await store.describeFolders();
    const storedPath = before.latestAssetPath ?? "";

    const result = await store.delete(previewRef);
    const after = await store.describeFolders();

    expect(result).toEqual({
      deleted: true,
      previewRef,
      path: storedPath,
    });
    await expect(stat(storedPath)).rejects.toThrow();
    await expect(store.read(previewRef)).rejects.toThrow(/no longer available/u);
    expect(after.assetCount).toBe(0);
    expect(after.latestAssetPath).toBeUndefined();
  });
});
