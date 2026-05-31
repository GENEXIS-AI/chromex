import { constants as fsConstants } from "node:fs";
import { access, cp, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import JSZip from "jszip";

const root = process.cwd();
const distDir = resolve(root, "packages/extension/dist");
const outDir = resolve(root, "output/chrome-web-store");
const stagingDir = resolve(outDir, "chromex-webstore-staging");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = String(packageJson.version ?? "0.0.0");
const timestamp = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const zipName = `chromex-${version}-chrome-web-store-${timestamp}.zip`;
const zipPath = resolve(outDir, zipName);

await assertPathExists(resolve(distDir, "manifest.json"), "Run npm run build before npm run package:webstore.");
await rm(stagingDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(distDir, stagingDir, { recursive: true });

await prepareStagingDirectory(stagingDir);
await removeOldWebStoreZips(outDir);
await createZipFromDirectory(stagingDir, zipPath);
await validatePackagedZip(zipPath);

console.log(`Chrome Web Store package created: ${zipPath}`);

async function prepareStagingDirectory(directory) {
  await sanitizeManifest(resolve(directory, "manifest.json"));
  await removeIfExists(resolve(directory, "build-info.json"));
  await walkFiles(directory, async (path) => {
    const name = basename(path);
    const extension = extname(path).toLowerCase();
    if (isBlockedStagingArtifact(name, extension)) {
      await unlink(path);
      return;
    }

    if (extension === ".js") {
      const source = await readFile(path, "utf8");
      const withoutSourceMapReference = source.replace(/\r?\n?\/\/[#@] sourceMappingURL=[^\r\n]*/gu, "");
      if (withoutSourceMapReference !== source) {
        await writeFile(path, withoutSourceMapReference);
      }
    }
  });
}

function isBlockedStagingArtifact(name, extension) {
  return (
    name === ".DS_Store" ||
    name.startsWith(".env") ||
    /^.+-source\.(?:png|jpe?g|webp)$/iu.test(name) ||
    [
      ".map",
      ".pem",
      ".key",
      ".log",
      ".tmp",
      ".crx",
      ".zip",
    ].includes(extension)
  );
}

async function sanitizeManifest(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.key;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function removeOldWebStoreZips(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^chromex-.+-chrome-web-store-.+\.zip$/u.test(entry.name))
      .map((entry) => unlink(resolve(directory, entry.name))),
  );
}

async function validatePackagedZip(path) {
  const zip = await JSZip.loadAsync(await readFile(path));
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Chrome Web Store package is invalid: manifest.json is missing.");
  }
  const manifestJson = await manifestFile.async("string");
  const manifest = JSON.parse(manifestJson);
  if ("key" in manifest) {
    throw new Error("Chrome Web Store package is invalid: manifest.key must not be present.");
  }
  const listing = Object.keys(zip.files).join("\n");
  const blockedPatterns = [
    /\.map\b/u,
    /build-info\.json/u,
    /\.env/u,
    /\.pem\b/u,
    /\.key\b/u,
    /node_modules/u,
    /__MACOSX/u,
    /\.DS_Store/u,
    /source\.(?:png|jpe?g|webp)/iu,
  ];
  const blocked = blockedPatterns.find((pattern) => pattern.test(listing));
  if (blocked) {
    throw new Error(`Chrome Web Store package contains blocked artifact matching ${blocked}.`);
  }
}

async function createZipFromDirectory(directory, path) {
  const zip = new JSZip();
  await addDirectoryToZip(zip, directory, directory);
  const payload = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  });
  await writeFile(path, payload);
}

async function addDirectoryToZip(zip, directory, baseDirectory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const archivePath = normalizeZipPath(relative(baseDirectory, path));
    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, path, baseDirectory);
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

function normalizeZipPath(path) {
  return path.split(sep).join("/");
}

async function removeIfExists(path) {
  await rm(path, { force: true });
}

async function assertPathExists(path, message) {
  try {
    await access(path, fsConstants.R_OK);
    const info = await stat(path);
    if (!info.isFile()) {
      throw new Error(message);
    }
  } catch {
    throw new Error(message);
  }
}
