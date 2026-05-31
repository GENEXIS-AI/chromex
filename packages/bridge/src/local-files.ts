import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { resolveRevealPathCommand } from "./platform.js";

export class BridgeLocalFilePlane {
  async reveal(params: { path?: string | null }): Promise<{ opened: true; path: string; folder: string }> {
    const targetPath = normalizeLocalFilePath(params.path);
    if (!targetPath) {
      throw new Error("Local file path is required.");
    }

    const metadata = await stat(targetPath).catch(() => null);
    if (!metadata) {
      throw new Error(`Local file does not exist: ${targetPath}`);
    }

    const isDirectory = metadata.isDirectory();
    const folder = isDirectory ? targetPath : dirname(targetPath);
    await revealLocalPath(targetPath, isDirectory);
    return { opened: true, path: targetPath, folder };
  }
}

function normalizeLocalFilePath(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = stripWrappingQuotes(value);
  if (!trimmed || /[\u0000-\u001f\u007f]/u.test(trimmed)) {
    return "";
  }

  if (/^file:\/\//iu.test(trimmed)) {
    return normalizeFileUrlPath(trimmed);
  }

  return resolve(trimmed);
}

function normalizeFileUrlPath(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") {
      return "";
    }
    const decodedPath = decodeURIComponent(url.pathname);
    if (/^\/[a-zA-Z]:\//u.test(decodedPath)) {
      return decodedPath.slice(1).replaceAll("/", "\\");
    }
    if (url.hostname) {
      return `\\\\${url.hostname}${decodedPath.replaceAll("/", "\\")}`;
    }
    return decodedPath;
  } catch {
    return "";
  }
}

function stripWrappingQuotes(value: string): string {
  let normalized = value.trim();
  while (
    normalized.length >= 2 &&
    ((normalized.startsWith("<") && normalized.endsWith(">")) ||
      (normalized.startsWith("\"") && normalized.endsWith("\"")) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function revealLocalPath(targetPath: string, isDirectory: boolean): Promise<void> {
  const { command, args } = resolveRevealPathCommand(targetPath, isDirectory);

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
