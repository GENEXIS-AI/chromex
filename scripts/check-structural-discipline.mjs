#!/usr/bin/env node
/**
 * Purpose: structural discipline checks for the external/chromex TS pilot.
 * Dependencies: Node standard library only.
 * Owner: codex
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const PACKAGES_DIR = join(ROOT, "packages");
const MAX_SOURCE_LINES = 2200;
const LARGE_FILE_ALLOWLIST = new Set([
  "packages/bridge/src/codex-plane.ts",
  "packages/extension/src/content/index.ts",
  "packages/extension/src/background/index.ts",
  "packages/extension/src/sidepanel/i18n.ts",
  "packages/extension/src/sidepanel/index.ts",
]);

function walkTsFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTsFiles(full));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function collectSourceFiles() {
  const packages = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES_DIR, entry.name, "src"))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory();
      } catch {
        return false;
      }
    });
  return packages.flatMap((dir) => walkTsFiles(dir));
}

const violations = [];

for (const file of collectSourceFiles()) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  if (/\bas any\b/.test(text)) {
    violations.push(`${rel}: banned source cast \`as any\``);
  }
  if (/as unknown as/.test(text)) {
    violations.push(`${rel}: banned source cast \`as unknown as\``);
  }
  if (/^\s*export\s+\*\s+from\s+/m.test(text) && !rel.match(/^packages\/[^/]+\/src\/index\.ts$/)) {
    violations.push(`${rel}: barrel re-export is allowed only at package src/index.ts`);
  }
  if (lines.length > MAX_SOURCE_LINES && !LARGE_FILE_ALLOWLIST.has(rel)) {
    violations.push(
      `${rel}: source file exceeds ${MAX_SOURCE_LINES} lines; split ownership or add a reviewed allowlist entry`,
    );
  }
}

if (violations.length > 0) {
  console.error("structural-discipline check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("structural-discipline check passed");
