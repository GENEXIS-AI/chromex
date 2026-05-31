import { inflateRawSync } from "node:zlib";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import type { CodexSkillOption, SkillArchiveInstallParams, SkillArchiveInstallResult } from "@codex-sidepanel/shared";

import { toStructuredToken } from "./app-server-mappers.js";

const MAX_ARCHIVE_BYTES = 12 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 500;

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  externalAttributes: number;
};

type ParsedSkillMetadata = {
  name: string;
  description: string;
};

export class ExternalSkillArchiveStore {
  readonly #rootDir: string;

  constructor(rootDir: string) {
    this.#rootDir = rootDir;
  }

  get rootDir(): string {
    return this.#rootDir;
  }

  async listSkills(cwd = ""): Promise<CodexSkillOption[]> {
    const roots = await this.listSkillRoots();
    const skills = await Promise.all(roots.map((root) => readSkillFromRoot(root, cwd)));
    return skills.filter((skill): skill is CodexSkillOption => skill !== null).sort((left, right) => left.name.localeCompare(right.name));
  }

  async listSkillRoots(): Promise<string[]> {
    if (!(await pathExists(this.#rootDir))) {
      return [];
    }

    const packageDirs = await readdir(this.#rootDir, { withFileTypes: true });
    const roots: string[] = [];
    for (const packageDir of packageDirs) {
      if (!packageDir.isDirectory()) {
        continue;
      }
      roots.push(...(await findSkillRoots(resolve(this.#rootDir, packageDir.name))));
    }
    return Array.from(new Set(roots)).sort((left, right) => left.localeCompare(right));
  }

  async listScanRoots(): Promise<string[]> {
    if (!(await pathExists(this.#rootDir))) {
      return [];
    }

    const packageRoots = (await readdir(this.#rootDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(this.#rootDir, entry.name));
    return Array.from(new Set([...packageRoots, ...(await this.listSkillRoots())])).sort((left, right) =>
      left.localeCompare(right),
    );
  }

  async installArchive(params: SkillArchiveInstallParams, cwd = ""): Promise<SkillArchiveInstallResult> {
    const filename = sanitizeArchiveFilename(params.filename);
    const archive = Buffer.from(params.base64, "base64");
    if (archive.length === 0) {
      throw new Error("Uploaded skill archive is empty.");
    }
    if (archive.length > MAX_ARCHIVE_BYTES) {
      throw new Error("Skill archive is too large. Keep ZIP files under 12 MB.");
    }

    const entries = parseZipEntries(archive);
    if (entries.length === 0) {
      throw new Error("Skill archive does not contain any files.");
    }
    if (entries.length > MAX_ENTRIES) {
      throw new Error("Skill archive contains too many files.");
    }

    const files = entries.filter((entry) => !entry.name.endsWith("/"));
    const totalUncompressed = files.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("Skill archive expands to too much data.");
    }

    const skillRoots = detectSkillRoots(files.map((entry) => entry.name));
    if (skillRoots.length === 0) {
      throw new Error("Skill archive must contain at least one SKILL.md file.");
    }

    const digest = createHash("sha256").update(archive).digest("hex").slice(0, 12);
    const installDir = resolve(this.#rootDir, `${filename}-${digest}`);
    await rm(installDir, { recursive: true, force: true });
    await mkdir(installDir, { recursive: true });

    for (const entry of files) {
      if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
        throw new Error(`Skill archive file is too large: ${entry.name}`);
      }
      if (isSymlinkEntry(entry)) {
        throw new Error(`Skill archive cannot contain symlinks: ${entry.name}`);
      }
      const safeName = normalizeZipEntryName(entry.name);
      if (!safeName) {
        continue;
      }
      const outputPath = resolve(installDir, safeName);
      if (!isPathInside(installDir, outputPath)) {
        throw new Error(`Skill archive contains an unsafe path: ${entry.name}`);
      }
      const data = inflateZipEntry(archive, entry);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, data, { mode: 0o600 });
    }

    const installedRoots = await findSkillRoots(installDir);
    const skills = (await Promise.all(installedRoots.map((root) => readSkillFromRoot(root, cwd)))).filter(
      (skill): skill is CodexSkillOption => skill !== null,
    );
    if (skills.length === 0) {
      throw new Error("No usable Codex skills were found after installing the archive.");
    }

    return {
      rootDir: installDir,
      skills: skills.sort((left, right) => left.name.localeCompare(right.name)),
    };
  }
}

function parseZipEntries(archive: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(archive);
  if (eocdOffset < 0) {
    throw new Error("Unsupported skill archive. Expected a standard ZIP file.");
  }

  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Skill archive central directory is invalid.");
    }

    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (method !== 0 && method !== 8) {
      throw new Error(`Unsupported ZIP compression method for ${name}.`);
    }

    normalizeZipEntryName(name);
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset, externalAttributes });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minimumOffset = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function inflateZipEntry(archive: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (archive.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`Skill archive local header is invalid: ${entry.name}`);
  }

  const nameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = archive.subarray(dataStart, dataStart + entry.compressedSize);
  const data = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
  if (data.length !== entry.uncompressedSize) {
    throw new Error(`Skill archive file size mismatch: ${entry.name}`);
  }
  return data;
}

function normalizeZipEntryName(name: string): string {
  const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) {
    return "";
  }
  if (parts.some((part) => part === "." || part === ".." || part.includes("\0"))) {
    throw new Error(`Skill archive contains an unsafe path: ${name}`);
  }
  return parts.join("/");
}

function isSymlinkEntry(entry: ZipEntry): boolean {
  return ((entry.externalAttributes >>> 16) & fsConstants.S_IFMT) === fsConstants.S_IFLNK;
}

function detectSkillRoots(names: string[]): string[] {
  const roots = names
    .map(normalizeZipEntryName)
    .filter((name) => basename(name).toLowerCase() === "skill.md")
    .map((name) => dirname(name))
    .map((root) => (root === "." ? "" : root));
  return Array.from(new Set(roots)).sort((left, right) => left.localeCompare(right));
}

async function findSkillRoots(rootDir: string): Promise<string[]> {
  const roots: string[] = [];
  await walk(rootDir, async (path, isDirectory) => {
    if (!isDirectory && basename(path).toLowerCase() === "skill.md") {
      roots.push(dirname(path));
    }
  });
  return roots.sort((left, right) => left.localeCompare(right));
}

async function readSkillFromRoot(root: string, cwd: string): Promise<CodexSkillOption | null> {
  const skillPath = resolve(root, "SKILL.md");
  if (!(await pathExists(skillPath))) {
    return null;
  }

  const raw = await readFile(skillPath, "utf8");
  const metadata = parseSkillMetadata(raw, basename(root));
  return {
    id: `${skillPath}#${metadata.name}`,
    name: metadata.name,
    description: metadata.description,
    path: skillPath,
    scope: "user",
    cwd,
    token: toStructuredToken(metadata.name),
  };
}

function parseSkillMetadata(raw: string, fallbackName: string): ParsedSkillMetadata {
  const frontmatter = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/u.exec(raw);
  const attributes = frontmatter ? parseYamlLikeAttributes(frontmatter[1] ?? "") : parseYamlLikeAttributes(raw);
  const title = /^#\s+(.+)$/mu.exec(raw)?.[1]?.trim();
  const name = slugifySkillName(attributes.name ?? fallbackName);
  const description = (attributes.description ?? attributes["short-description"] ?? attributes.short_description ?? title ?? "").trim();
  return { name, description };
}

function parseYamlLikeAttributes(value: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const line of value.split(/\r?\n/u)) {
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/u.exec(line);
    if (!match) {
      continue;
    }
    attributes[match[1] ?? ""] = String(match[2] ?? "").replace(/^['"]|['"]$/g, "").trim();
  }
  return attributes;
}

function slugifySkillName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "uploaded-skill";
}

function sanitizeArchiveFilename(filename: string): string {
  const name = basename(filename, ".zip")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || "skills";
}

async function walk(root: string, visit: (path: string, isDirectory: boolean) => Promise<void> | void): Promise<void> {
  if (!(await pathExists(root))) {
    return;
  }

  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    await visit(path, entry.isDirectory());
    if (entry.isDirectory()) {
      await walk(path, visit);
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isPathInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && rel !== ".." && !rel.startsWith(`..${sep}`));
}
