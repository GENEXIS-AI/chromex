import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import process from "node:process";

const root = process.cwd();

const blockedPathPatterns = [
  /(^|\/)node_modules\//u,
  /^packages\/[^/]+\/dist\//u,
  /^output\//u,
  /^\.codex\//u,
  /^\.codex-sidepanel\//u,
  /^__load_extension__(?:\/|\.crx$|\.pem$)/u,
  /(^|\/)\.DS_Store$/u,
  /(^|\/)tmp-/u,
  /\.pem$/u,
  /\.crx$/u,
  /\.log$/u,
  /\.tmp$/u,
  /(^|\/)\.env(?:\.|$)/u,
];

const allowedBlockedPathPatterns = [/^\.env\.example$/u];

const secretPatterns = [
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
    name: "OpenAI project or live key",
    pattern: /\bsk-(?:proj|live)-[A-Za-z0-9_-]{20,}\b/gu,
  },
  {
    name: "OpenAI API key",
    pattern: /\bsk-[A-Za-z0-9]{32,}\b/gu,
  },
  {
    name: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/gu,
  },
  {
    name: "developer home path",
    pattern: /\/Users\/choewonjun\b/gu,
  },
  {
    name: "local workspace name",
    pattern: new RegExp("(?:\\uBC14\\uC774\\uBE0C\\uCF54\\uB529|\\u1107\\u1161\\u110B\\u1175\\u1107\\u1173\\u110F\\u1169\\u1103\\u1175\\u11BC)", "gu"),
  },
];

const binaryExtensions = new Set([
  ".avif",
  ".bmp",
  ".crx",
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

const fallbackIgnoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "output",
  ".codex",
  ".codex-sidepanel",
  "codex-sidepanel-backups",
  "chromex-backups",
  "backups",
]);

const files = await listPublishCandidateFiles();
const findings = [];

for (const file of files) {
  const normalized = normalizePath(file);
  if (isBlockedPublishPath(normalized)) {
    findings.push({
      file: normalized,
      reason: "ignored or generated artifact would be published",
    });
    continue;
  }

  if (binaryExtensions.has(extname(normalized).toLowerCase())) {
    continue;
  }

  const content = await readFile(join(root, file), "utf8").catch(() => "");
  for (const secret of secretPatterns) {
    secret.pattern.lastIndex = 0;
    const match = secret.pattern.exec(content);
    if (match) {
      findings.push({
        file: normalized,
        reason: `possible ${secret.name}`,
        sample: redact(match[0]),
      });
    }
  }
}

if (findings.length) {
  console.error("Release audit failed:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.reason}${finding.sample ? ` (${finding.sample})` : ""}`);
  }
  process.exit(1);
}

console.log(`Release audit passed: scanned ${files.length} publish candidate files.`);

async function listPublishCandidateFiles() {
  const gitFiles = listGitCandidateFiles();
  if (gitFiles) {
    return gitFiles;
  }
  const results = [];
  await walk(".", results);
  return results;
}

function listGitCandidateFiles() {
  try {
    const inside = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (inside !== "true") {
      return null;
    }
    return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => existsSync(join(root, line)));
  } catch {
    return null;
  }
}

async function walk(directory, results) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    const path = directory === "." ? entry.name : join(directory, entry.name);
    const normalized = normalizePath(path);
    if (entry.isDirectory()) {
      if (fallbackIgnoredDirectories.has(entry.name) || normalized.endsWith("/dist")) {
        continue;
      }
      await walk(path, results);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (isBlockedPublishPath(normalized)) {
      continue;
    }
    const info = await stat(join(root, path));
    if (info.size > 2 * 1024 * 1024 && !normalized.startsWith("docs/assets/")) {
      continue;
    }
    results.push(path);
  }
}

function isBlockedPublishPath(path) {
  if (allowedBlockedPathPatterns.some((pattern) => pattern.test(path))) {
    return false;
  }
  return blockedPathPatterns.some((pattern) => pattern.test(path));
}

function normalizePath(path) {
  return relative(root, join(root, path)).split(sep).join("/");
}

function redact(value) {
  if (value.length <= 12) {
    return "[redacted]";
  }
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
