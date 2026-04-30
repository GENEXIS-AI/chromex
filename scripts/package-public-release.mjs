import { execFileSync } from "node:child_process";
import { copyFile, cp, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import JSZip from "jszip";

const root = process.cwd();
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = String(packageJson.version ?? "0.0.0");
const timestamp = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const distDir = resolve(root, "packages/extension/dist");
const outDir = resolve(root, "output/public-release");
const sourceStagingDir = resolve(outDir, "chromex-public-source");
const unpackedStagingDir = resolve(outDir, "chromex-unpacked-extension");
const sourceZipPath = resolve(outDir, `chromex-${version}-public-source-${timestamp}.zip`);
const unpackedZipPath = resolve(outDir, `chromex-${version}-unpacked-extension-${timestamp}.zip`);
const stableSourceZipPath = resolve(outDir, "chromex-public-source.zip");
const stableUnpackedZipPath = resolve(outDir, "chromex-unpacked-extension.zip");

const sourceBlockedPathPatterns = [
  /(^|\/)\.git(?:\/|$)/u,
  /(^|\/)node_modules\//u,
  /^docs\//u,
  /^packages\/[^/]+\/dist\//u,
  /^output\//u,
  /^\.codex\//u,
  /^\.codex-sidepanel\//u,
  /^__load_extension__(?:\/|\.crx$|\.pem$)/u,
  /(^|\/)(?:CODEX|CLAUDE|AGENTS|GEMINI|MEMORY)\.md$/u,
  /(^|\/)[^/]*harness[^/]*\.md$/iu,
  /(^|\/)\.DS_Store$/u,
  /(^|\/)tmp-/u,
  /\.pem$/u,
  /\.key$/u,
  /\.crx$/u,
  /\.log$/u,
  /\.tmp$/u,
  /(^|\/)\.env(?:\.|$)/u,
  /(^|\/)(?:codex-sidepanel-backups|chromex-backups|\.codex-backups|backups)\//u,
];

const sourceAllowedBlockedPathPatterns = [/^\.env\.example$/u];

const textSecretPatterns = [
  {
    name: "private key block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/giu,
  },
  {
    name: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}\b/gu,
  },
  {
    name: "GitHub fine-grained token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/gu,
  },
  {
    name: "OpenAI API key",
    pattern: /\bsk-(?:proj-|live-)?[A-Za-z0-9_-]{20,}\b/gu,
  },
  {
    name: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/gu,
  },
  {
    name: "developer home path",
    pattern: /\/Users\/choewonjun\b/gu,
  },
];

const binaryExtensions = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

await assertExtensionBuilt();
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await stagePublicSource();
await stageUnpackedExtension();
await createZipFromDirectory(sourceStagingDir, sourceZipPath, "chromex");
await createZipFromDirectory(unpackedStagingDir, unpackedZipPath, "chromex-extension");
await validateArchive(sourceZipPath, { expectedManifest: false });
await validateArchive(unpackedZipPath, { expectedManifest: true, requireManifestKey: true });
await copyFile(sourceZipPath, stableSourceZipPath);
await copyFile(unpackedZipPath, stableUnpackedZipPath);
await validateArchive(stableSourceZipPath, { expectedManifest: false });
await validateArchive(stableUnpackedZipPath, { expectedManifest: true, requireManifestKey: true });

console.log(`Public source archive created: ${sourceZipPath}`);
console.log(`Unpacked extension archive created: ${unpackedZipPath}`);
console.log(`Stable public source archive created: ${stableSourceZipPath}`);
console.log(`Stable unpacked extension archive created: ${stableUnpackedZipPath}`);
console.log(`Load this unpacked folder in Chrome after unzip: ${unpackedStagingDir}`);

async function assertExtensionBuilt() {
  const manifestPath = resolve(distDir, "manifest.json");
  const info = await stat(manifestPath).catch(() => null);
  if (!info?.isFile()) {
    throw new Error("Run npm run build before packaging a public release.");
  }
}

async function stagePublicSource() {
  await rm(sourceStagingDir, { recursive: true, force: true });
  await mkdir(sourceStagingDir, { recursive: true });
  const files = listPublicSourceFiles();
  const findings = [];

  for (const file of files) {
    const normalized = normalizePath(file);
    if (isBlockedSourcePath(normalized)) {
      findings.push(`${normalized}: blocked source path`);
      continue;
    }
    if (!binaryExtensions.has(extname(normalized).toLowerCase())) {
      const content = await readFile(resolve(root, file), "utf8").catch(() => "");
      for (const secret of textSecretPatterns) {
        secret.pattern.lastIndex = 0;
        const match = secret.pattern.exec(content);
        if (match) {
          findings.push(`${normalized}: possible ${secret.name}`);
        }
      }
    }
    const destination = resolve(sourceStagingDir, normalized);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(root, file), destination, { recursive: true });
  }

  if (findings.length) {
    throw new Error(`Public source package blocked:\n${findings.join("\n")}`);
  }
}

function listPublicSourceFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !isBlockedSourcePath(normalizePath(file)));
}

async function stageUnpackedExtension() {
  await rm(unpackedStagingDir, { recursive: true, force: true });
  await cp(distDir, unpackedStagingDir, { recursive: true });
  await removeIfExists(resolve(unpackedStagingDir, "build-info.json"));
  await walkFiles(unpackedStagingDir, async (path) => {
    const name = basename(path);
    const extension = extname(path).toLowerCase();
    if (isBlockedUnpackedArtifact(name, extension)) {
      await unlink(path);
      return;
    }
    if (extension === ".js") {
      const source = await readFile(path, "utf8");
      const sanitized = source.replace(/\r?\n?\/\/[#@] sourceMappingURL=[^\r\n]*/gu, "");
      if (sanitized !== source) {
        await writeFile(path, sanitized);
      }
    }
  });
}

function isBlockedUnpackedArtifact(name, extension) {
  return (
    name === ".DS_Store" ||
    name.startsWith(".env") ||
    /^.+-source\.(?:png|jpe?g|webp)$/iu.test(name) ||
    [".map", ".pem", ".key", ".log", ".tmp", ".crx", ".zip"].includes(extension)
  );
}

async function createZipFromDirectory(directory, zipPath, archiveRoot) {
  const zip = new JSZip();
  await addDirectoryToZip(zip, directory, directory, archiveRoot);
  const payload = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  });
  await writeFile(zipPath, payload);
}

async function addDirectoryToZip(zip, directory, baseDirectory, archiveRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const archivePath = normalizeZipPath(join(archiveRoot, relative(baseDirectory, path)));
    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, path, baseDirectory, archiveRoot);
      continue;
    }
    if (entry.isFile()) {
      zip.file(archivePath, await readFile(path), {
        date: new Date(0),
        unixPermissions: 0o100644,
      });
    }
  }
}

async function validateArchive(zipPath, { expectedManifest, requireManifestKey = false }) {
  const zip = await JSZip.loadAsync(await readFile(zipPath));
  const listing = Object.keys(zip.files).join("\n");
  const blockedPatterns = [
    /(^|\/)\.codex\//u,
    /(^|\/)(?:CODEX|CLAUDE|AGENTS|GEMINI|MEMORY)\.md$/u,
    /(^|\/)[^/]*harness[^/]*\.md$/iu,
    /\.map\b/u,
    /build-info\.json/u,
    /\.env/u,
    /(^|\/)docs\//u,
    /\.pem\b/u,
    /\.key\b/u,
    /node_modules/u,
    /__MACOSX/u,
    /\.DS_Store/u,
  ];
  if (expectedManifest) {
    blockedPatterns.push(/source\.(?:png|jpe?g|webp)/iu);
  }
  const blocked = blockedPatterns.find((pattern) => pattern.test(listing));
  if (blocked) {
    throw new Error(`${basename(zipPath)} contains blocked artifact matching ${blocked}.`);
  }
  const manifestFile = zip.file("chromex-extension/manifest.json");
  if (expectedManifest && !manifestFile) {
    throw new Error(`${basename(zipPath)} is missing chromex-extension/manifest.json.`);
  }
  if (manifestFile && requireManifestKey) {
    const manifest = JSON.parse(await manifestFile.async("string"));
    if (typeof manifest.key !== "string" || !manifest.key) {
      throw new Error(`${basename(zipPath)} must keep manifest.key so Windows native-host installs use a stable extension ID.`);
    }
  }
}

async function walkFiles(directory, visitor) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__MACOSX") {
        await rm(path, { recursive: true, force: true });
        continue;
      }
      await walkFiles(path, visitor);
      continue;
    }
    if (entry.isFile()) {
      await visitor(path);
    }
  }
}

function isBlockedSourcePath(path) {
  if (sourceAllowedBlockedPathPatterns.some((pattern) => pattern.test(path))) {
    return false;
  }
  return sourceBlockedPathPatterns.some((pattern) => pattern.test(path));
}

function normalizePath(path) {
  return path.split(sep).join("/");
}

function normalizeZipPath(path) {
  return path.split(sep).join("/");
}

async function removeIfExists(path) {
  await rm(path, { force: true });
}
