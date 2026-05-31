import { spawn } from "node:child_process";
import { copyFile, mkdir, open, readFile, readdir, rm, stat, writeFile, mkdtemp } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ImageAssetFolderSnapshot } from "@codex-sidepanel/shared";
import type { BridgeDiagnostics } from "./diagnostics.js";
import { resolveDefaultGeneratedImageDir, resolveOpenFolderCommand } from "./platform.js";

const ASSET_REF_PREFIX = "codex-asset:";
const DEFAULT_CHUNK_BYTES = 256 * 1024;
const MAX_CHUNK_BYTES = 768 * 1024;
const ASSET_MANIFEST_FILE = ".codex-sidepanel-image-assets.json";

export interface BridgeImageAssetReadResult {
  previewRef: string;
  dataBase64: string;
  mimeType: string;
  sizeBytes: number;
  offset: number;
  nextOffset: number;
  done: boolean;
}

export interface BridgeImageAssetDeleteResult {
  deleted: boolean;
  previewRef: string;
  path: string;
}

type ImageAssetRecord = {
  path: string;
  mimeType: string;
  createdAt: number;
};

type BridgeImageAssetStoreOptions = {
  rootDir?: Promise<string>;
  outputDir?: () => Promise<string | null | undefined> | string | null | undefined;
  fetchImage?: typeof fetch;
  diagnostics?: BridgeDiagnostics;
};

export class BridgeImageAssetStore {
  readonly #assets = new Map<string, ImageAssetRecord>();
  readonly #fallbackDirPromise: Promise<string>;
  readonly #outputDir?: BridgeImageAssetStoreOptions["outputDir"];
  readonly #fetchImage: typeof fetch;
  readonly #diagnostics: BridgeDiagnostics | undefined;

  constructor(options: Promise<string> | BridgeImageAssetStoreOptions = mkdtemp(join(tmpdir(), "codex-sidepanel-assets-"))) {
    if (
      typeof (options as BridgeImageAssetStoreOptions).outputDir === "function" ||
      typeof (options as BridgeImageAssetStoreOptions).outputDir === "string" ||
      (options as BridgeImageAssetStoreOptions).rootDir ||
      (options as BridgeImageAssetStoreOptions).fetchImage
    ) {
      const storeOptions = options as BridgeImageAssetStoreOptions;
      this.#fallbackDirPromise = storeOptions.rootDir ?? mkdtemp(join(tmpdir(), "codex-sidepanel-assets-"));
      this.#outputDir = storeOptions.outputDir;
      this.#fetchImage = storeOptions.fetchImage ?? fetch;
      this.#diagnostics = storeOptions.diagnostics;
      return;
    }

    this.#fallbackDirPromise = options as Promise<string>;
    this.#fetchImage = fetch;
  }

  async registerFile(filePath: string, mimeType = extensionToMimeType(filePath)): Promise<string> {
    const storedPath = await this.#copyFileToAssetStore(filePath, mimeType);
    const assetId = randomUUID();
    this.#assets.set(assetId, { path: storedPath, mimeType, createdAt: Date.now() });
    await this.#persistManifest();
    await this.#record("image.asset.registered", {
      sourcePath: filePath,
      storedPath,
      mimeType,
      assetId,
    });
    return toBridgeImageAssetRef(assetId);
  }

  async registerDataUrl(dataUrl: string): Promise<string> {
    const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/iu);
    if (!match?.[1] || !match[2]) {
      throw new Error("Generated image data URL is not a supported base64 image.");
    }
    return this.registerBase64(match[2], match[1]);
  }

  async registerBase64(base64: string, mimeType = "image/png"): Promise<string> {
    const filePath = await this.#writeBase64Asset("generated", base64, mimeType);
    return this.registerFile(filePath, mimeType);
  }

  async registerRemoteImageUrl(url: string): Promise<string> {
    const response = await this.#fetchImage(url);
    if (!response.ok) {
      throw new Error(`Generated image download failed with HTTP ${response.status}.`);
    }
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    if (!mimeType.startsWith("image/")) {
      throw new Error(`Generated image URL returned ${mimeType}, not an image.`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const previewRef = await this.registerBase64(bytes.toString("base64"), mimeType);
    await this.#record("image.asset.remote.persisted", {
      url,
      mimeType,
      sizeBytes: bytes.byteLength,
    });
    return previewRef;
  }

  async persistInputBase64(base64: string, mimeType = "image/png"): Promise<{ path: string; previewRef: string }> {
    const filePath = await this.#writeBase64Asset("input", base64, mimeType);
    const previewRef = await this.registerFile(filePath, mimeType);
    await this.#record("image.asset.input.persisted", {
      path: filePath,
      mimeType,
      sizeBytes: Buffer.byteLength(base64.replace(/\s+/gu, ""), "base64"),
    });
    return {
      path: filePath,
      previewRef,
    };
  }

  async read(
    previewRef: string,
    params: { offset?: number | null; length?: number | null } = {},
  ): Promise<BridgeImageAssetReadResult> {
    const assetId = parseBridgeImageAssetRef(previewRef);
    if (!assetId) {
      throw new Error("Unsupported image asset reference.");
    }

    let asset = this.#assets.get(assetId);
    if (!asset) {
      await this.#loadManifest();
      asset = this.#assets.get(assetId);
    }
    if (!asset) {
      throw new Error("Generated image asset is no longer available.");
    }

    const metadata = await stat(asset.path);
    const sizeBytes = metadata.size;
    const offset = clampInteger(params.offset ?? 0, 0, sizeBytes);
    const length = clampInteger(params.length ?? DEFAULT_CHUNK_BYTES, 1, MAX_CHUNK_BYTES);
    const readLength = Math.min(length, Math.max(0, sizeBytes - offset));
    const buffer = Buffer.alloc(readLength);

    if (readLength > 0) {
      const handle = await open(asset.path, "r");
      try {
        await handle.read(buffer, 0, readLength, offset);
      } finally {
        await handle.close();
      }
    }

    const nextOffset = offset + readLength;
    await this.#record("image.asset.read", {
      previewRef,
      path: asset.path,
      mimeType: asset.mimeType,
      sizeBytes,
      offset,
      nextOffset,
      done: nextOffset >= sizeBytes,
    });
    return {
      previewRef,
      dataBase64: buffer.toString("base64"),
      mimeType: asset.mimeType,
      sizeBytes,
      offset,
      nextOffset,
      done: nextOffset >= sizeBytes,
    };
  }

  async delete(previewRef: string): Promise<BridgeImageAssetDeleteResult> {
    const assetId = parseBridgeImageAssetRef(previewRef);
    if (!assetId) {
      throw new Error("Unsupported image asset reference.");
    }

    const asset = this.#assets.get(assetId);
    if (!asset) {
      throw new Error("Generated image asset is no longer available.");
    }

    this.#assets.delete(assetId);
    await rm(asset.path, { force: true });
    await this.#persistManifest();
    await this.#record("image.asset.deleted", {
      previewRef,
      path: asset.path,
      mimeType: asset.mimeType,
    });
    return {
      deleted: true,
      previewRef,
      path: asset.path,
    };
  }

  async describeFolders(): Promise<ImageAssetFolderSnapshot> {
    const rootDir = await this.#resolveAssetDirectory();
    const assets = await this.#listKnownAssets(rootDir);
    const folders = Array.from(new Set([rootDir, ...assets.map((asset) => dirname(asset.path))]));
    const latestAsset = assets[0] ?? null;
    const snapshot: ImageAssetFolderSnapshot = {
      rootDir,
      latestFolder: latestAsset ? dirname(latestAsset.path) : rootDir,
      folders,
      assetCount: assets.length,
    };
    if (latestAsset) {
      snapshot.latestAssetPath = latestAsset.path;
    }
    return snapshot;
  }

  async #listKnownAssets(rootDir: string): Promise<ImageAssetRecord[]> {
    await this.#loadManifest();
    const assetsByPath = new Map<string, ImageAssetRecord>();
    for (const asset of this.#assets.values()) {
      assetsByPath.set(asset.path, asset);
    }

    for (const asset of await this.#scanImageAssetFiles(rootDir)) {
      if (!assetsByPath.has(asset.path)) {
        assetsByPath.set(asset.path, asset);
      }
    }

    return Array.from(assetsByPath.values()).sort((left, right) => right.createdAt - left.createdAt);
  }

  async #scanImageAssetFiles(rootDir: string): Promise<ImageAssetRecord[]> {
    const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
    const records: ImageAssetRecord[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !isImageAssetFileName(entry.name)) {
        continue;
      }
      const filePath = join(rootDir, entry.name);
      const metadata = await stat(filePath).catch(() => null);
      if (!metadata?.isFile()) {
        continue;
      }
      records.push({
        path: filePath,
        mimeType: extensionToMimeType(filePath),
        createdAt: metadata.mtimeMs,
      });
    }
    return records;
  }

  async #persistManifest(): Promise<void> {
    const manifestPath = join(await this.#resolveAssetDirectory(), ASSET_MANIFEST_FILE);
    const assets = Array.from(this.#assets.entries()).map(([id, asset]) => ({
      id,
      path: asset.path,
      mimeType: asset.mimeType,
      createdAt: asset.createdAt,
    }));
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          version: 1,
          assets,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  async #loadManifest(): Promise<void> {
    const manifestPath = join(await this.#resolveAssetDirectory(), ASSET_MANIFEST_FILE);
    const raw = await readFile(manifestPath, "utf8").catch(() => "");
    if (!raw) {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isManifestPayload(parsed)) {
      return;
    }
    for (const asset of parsed.assets) {
      const metadata = await stat(asset.path).catch(() => null);
      if (!metadata?.isFile()) {
        continue;
      }
      this.#assets.set(asset.id, {
        path: asset.path,
        mimeType: asset.mimeType,
        createdAt: asset.createdAt,
      });
    }
  }

  async openFolder(folder?: string | null): Promise<{ opened: true; folder: string }> {
    const snapshot = await this.describeFolders();
    const targetFolder = folder?.trim() || snapshot.latestFolder || snapshot.rootDir;
    if (!snapshot.folders.includes(targetFolder)) {
      throw new Error("Refusing to open an unknown image folder.");
    }

    await openLocalFolder(targetFolder);
    return { opened: true, folder: targetFolder };
  }

  async #resolveAssetDirectory(): Promise<string> {
    const configuredOutputDir = await this.#resolveConfiguredOutputDir();
    const assetDir = configuredOutputDir || (await this.#fallbackDirPromise);
    await mkdir(assetDir, { recursive: true });
    return assetDir;
  }

  async #resolveConfiguredOutputDir(): Promise<string> {
    const value = typeof this.#outputDir === "function" ? await this.#outputDir() : this.#outputDir;
    const normalized = expandConfiguredLocalPath(value);
    return normalized ? resolve(normalized) : "";
  }

  async #writeBase64Asset(prefix: "generated" | "input", base64: string, mimeType: string): Promise<string> {
    const outputDir = await this.#resolveAssetDirectory();
    const filePath = join(outputDir, `${prefix}-${Date.now()}-${randomUUID()}${mimeTypeToExtension(mimeType)}`);
    await writeFile(filePath, Buffer.from(base64.replace(/\s+/gu, ""), "base64"));
    await this.#record("image.asset.written", {
      prefix,
      filePath,
      mimeType,
      sizeBytes: Buffer.byteLength(base64.replace(/\s+/gu, ""), "base64"),
    });
    return filePath;
  }

  async #copyFileToAssetStore(filePath: string, mimeType: string): Promise<string> {
    await stat(filePath);
    const assetDir = await this.#resolveAssetDirectory();
    const sourcePath = resolve(filePath);
    const sourceDir = dirname(sourcePath);
    if (sourceDir === resolve(assetDir)) {
      return sourcePath;
    }

    const extension = extname(sourcePath) || mimeTypeToExtension(mimeType);
    const storedPath = join(assetDir, `generated-${Date.now()}-${randomUUID()}${extension}`);
    await copyFile(sourcePath, storedPath);
    return storedPath;
  }

  async #record(event: string, details: Record<string, unknown>): Promise<void> {
    await this.#diagnostics?.record(event, details).catch(() => undefined);
  }
}

export function isBridgeImageAssetRef(value: string): boolean {
  return parseBridgeImageAssetRef(value) !== null;
}

export function toBridgeImageAssetRef(assetId: string): string {
  return `${ASSET_REF_PREFIX}${assetId}`;
}

export function parseBridgeImageAssetRef(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith(ASSET_REF_PREFIX)) {
    return null;
  }

  const assetId = trimmed.slice(ASSET_REF_PREFIX.length);
  return /^[0-9a-f-]{36}$/iu.test(assetId) ? assetId : null;
}

export function extensionToMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

export function resolveGeneratedImageOutputDir(workspaceRoot?: string | null): string {
  const normalizedWorkspaceRoot = expandConfiguredLocalPath(workspaceRoot);
  if (normalizedWorkspaceRoot) {
    return join(normalizedWorkspaceRoot, ".codex-sidepanel", "generated-images");
  }
  return resolveDefaultGeneratedImageDir();
}

export async function readFileAsImageDataUrl(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return `data:${extensionToMimeType(filePath)};base64,${bytes.toString("base64")}`;
}

function mimeTypeToExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".png";
  }
}

function isImageAssetFileName(fileName: string): boolean {
  return /^(generated|input)-.+\.(?:png|jpe?g|webp|gif)$/iu.test(fileName);
}

function expandConfiguredLocalPath(value: string | null | undefined): string {
  let expanded = stripWrappingQuotes(value?.trim() ?? "");
  if (!expanded) {
    return "";
  }

  const homeDirectory = homedir();
  if (expanded === "~" || expanded.startsWith("~/") || expanded.startsWith("~\\")) {
    expanded = `${homeDirectory}${expanded.slice(1)}`;
  }

  expanded = expanded.replace(/%([^%]+)%/gu, (match, key: string) => readEnvValue(process.env, key) ?? match);
  expanded = expanded.replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/giu, (match, key: string) =>
    readEnvValue(process.env, key) ?? match,
  );
  return stripWrappingQuotes(expanded);
}

function stripWrappingQuotes(value: string): string {
  let normalized = value.trim();
  while (
    normalized.length >= 2 &&
    ((normalized.startsWith("\"") && normalized.endsWith("\"")) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function readEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const exactValue = env[key];
  if (typeof exactValue === "string") {
    return exactValue;
  }

  const normalizedKey = key.toLowerCase();
  const actualKey = Object.keys(env).find((candidate) => candidate.toLowerCase() === normalizedKey);
  const value = actualKey ? env[actualKey] : undefined;
  return typeof value === "string" ? value : undefined;
}

function isManifestPayload(value: unknown): value is {
  assets: Array<{
    id: string;
    path: string;
    mimeType: string;
    createdAt: number;
  }>;
} {
  if (!value || typeof value !== "object" || !Array.isArray((value as { assets?: unknown }).assets)) {
    return false;
  }
  return (value as { assets: unknown[] }).assets.every((asset) => {
    if (!asset || typeof asset !== "object") {
      return false;
    }
    const candidate = asset as Record<string, unknown>;
    return (
      typeof candidate.id === "string" &&
      parseBridgeImageAssetRef(toBridgeImageAssetRef(candidate.id)) === candidate.id &&
      typeof candidate.path === "string" &&
      typeof candidate.mimeType === "string" &&
      candidate.mimeType.startsWith("image/") &&
      typeof candidate.createdAt === "number" &&
      Number.isFinite(candidate.createdAt)
    );
  });
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function openLocalFolder(folder: string): Promise<void> {
  const { command, args } = resolveOpenFolderCommand(folder);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: true,
      shell: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
