import { execFileSync } from "node:child_process";
import process from "node:process";

const blockedHistoricalPathPatterns = [
  {
    name: "Codex workspace harness/config",
    pattern: /(^|\/)(?:\.codex\/|CODEX\.md$|CLAUDE\.md$|AGENTS\.md$|GEMINI\.md$|MEMORY\.md$|[^/]*harness[^/]*\.md$)/iu,
  },
  {
    name: "local extension signing or native-host artifact",
    pattern: /(^|\/)__load_extension__(?:\/|\.crx$|\.pem$)|\.(?:pem|key)$/iu,
  },
  {
    name: "secret or local environment file",
    pattern: /(^|\/)\.env(?:\.|$)/iu,
  },
  {
    name: "generated build output",
    pattern: /(^|\/)(?:output\/|packages\/[^/]+\/dist\/|node_modules\/)/iu,
  },
  {
    name: "local app data or backup",
    pattern: /(^|\/)(?:\.codex-sidepanel\/|codex-sidepanel-backups\/|chromex-backups\/|\.codex-backups\/|backups\/)/iu,
  },
];

const historyPaths = listHistoricalPaths();
const findings = [];

for (const path of historyPaths) {
  const normalized = path.trim().replaceAll("\\", "/");
  if (!normalized) {
    continue;
  }
  const finding = blockedHistoricalPathPatterns.find((entry) => entry.pattern.test(normalized));
  if (finding) {
    findings.push({ path: normalized, reason: finding.name });
  }
}

if (findings.length) {
  console.error("Git history audit failed: blocked paths are present in historical commits.");
  console.error("Removing files in a later commit does not remove them from a public repository history.");
  console.error("Publish a fresh repository from a sanitized export, or rewrite history before making the repository public.");
  for (const finding of findings.slice(0, 80)) {
    console.error(`- ${finding.path}: ${finding.reason}`);
  }
  if (findings.length > 80) {
    console.error(`- ...and ${findings.length - 80} more historical path findings`);
  }
  process.exit(1);
}

console.log(`Git history audit passed: scanned ${historyPaths.length} historical paths.`);

function listHistoricalPaths() {
  try {
    const inside = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (inside !== "true") {
      throw new Error("not inside a git work tree");
    }
    return Array.from(
      new Set(
        execFileSync("git", ["log", "--all", "--name-only", "--pretty=format:"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          maxBuffer: 64 * 1024 * 1024,
        })
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    ).sort();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Unable to inspect git history: ${message}`);
    process.exit(2);
  }
}
