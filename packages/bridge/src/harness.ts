import { access, readFile, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_HARNESS_PERMISSIONS,
  matchesHarnessPattern,
  type HarnessPermissionConfig,
  type WorkspaceHarnessSnapshot,
  type WorkspaceInstructionScope,
  type WorkspaceInstructionSource,
  type WorkspaceShortcut,
} from "@codex-sidepanel/shared";

import { createHookProcessEnv } from "./environment.js";
import { resolveCodexSidepanelConfigDir, resolveHookShellCommand } from "./platform.js";

type BridgeHookEventName =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PromptSubmit"
  | "PromptComplete"
  | "ImageEditStart"
  | "ImageEditComplete"
  | "VoiceSessionStart"
  | "VoiceSessionStop"
  | "InstructionsLoaded";

type HookHandler = {
  type: "command";
  command: string;
};

type HookMatcherGroup = {
  matcher?: string;
  hooks?: HookHandler[];
};

type HarnessSettingsFile = {
  permissions?: Partial<HarnessPermissionConfig>;
  hooks?: Partial<Record<BridgeHookEventName, HookMatcherGroup[]>>;
};

type HookExecutionResult = {
  appendPrompt: string[];
};

type InstructionEntry = WorkspaceInstructionSource & {
  content: string;
};

type ParsedFrontmatter = {
  attributes: Record<string, string | string[]>;
  body: string;
};

type HookCommandOutput = {
  decision?: "allow" | "deny";
  reason?: string;
  appendPrompt?: string;
};

export class BridgeHarnessRuntime {
  #workspaceRoot: string;
  readonly #userRoot: string;

  constructor(options: { workspaceRoot?: string; userRoot?: string } = {}) {
    this.#workspaceRoot = normalizeWorkspaceRoot(options.workspaceRoot ?? process.env.CODEX_SIDEPANEL_WORKSPACE ?? "");
    this.#userRoot = normalizeUserRoot(options.userRoot ?? process.env.CODEX_SIDEPANEL_HOME);
  }

  async getWorkspaceRoot(): Promise<string> {
    return this.#workspaceRoot;
  }

  resolveUserPath(...segments: string[]): string {
    return resolve(this.#userRoot, ...segments);
  }

  async configure(options: { workspaceRoot?: string | null }): Promise<void> {
    if (options.workspaceRoot !== undefined) {
      this.#workspaceRoot = normalizeWorkspaceRoot(options.workspaceRoot);
    }
  }

  async readSnapshot(): Promise<WorkspaceHarnessSnapshot> {
    const [settings, instructions, shortcuts] = await Promise.all([
      this.#loadSettings(),
      this.#loadInstructionEntries(),
      this.#loadShortcuts(),
    ]);

    return {
      workspaceRoot: this.#workspaceRoot,
      configSources: settings.sources,
      instructionSources: instructions.map((entry) => ({
        id: entry.id,
        title: entry.title,
        path: entry.path,
        kind: entry.kind,
        scope: entry.scope,
        ...(entry.domains?.length ? { domains: entry.domains } : {}),
        ...(entry.profiles?.length ? { profiles: entry.profiles } : {}),
      })),
      permissions: settings.permissions,
      hooks: {
        enabled: Object.keys(settings.hooks).length > 0,
        eventCount: Object.keys(settings.hooks).length,
      },
      shortcuts,
    };
  }

  async resolvePromptInstructions(params: {
    profileId: string;
    domains: string[];
  }): Promise<{ text: string; sources: WorkspaceInstructionSource[] }> {
    const instructions = await this.#loadInstructionEntries();
    const active = instructions.filter((entry) => this.#matchesInstruction(entry, params.profileId, params.domains));

    if (!active.length) {
      return { text: "", sources: [] };
    }

    await this.runHooks("InstructionsLoaded", "instructions", {
      profileId: params.profileId,
      instructionPaths: active.map((entry) => entry.path),
    });

    return {
      text: active
        .map(
          (entry) =>
            [`WORKSPACE ${entry.kind.toUpperCase()}: ${entry.title}`, `Path: ${entry.path}`, entry.content].join("\n"),
        )
        .join("\n\n"),
      sources: active.map((entry) => ({
        id: entry.id,
        title: entry.title,
        path: entry.path,
        kind: entry.kind,
        scope: entry.scope,
        ...(entry.domains?.length ? { domains: entry.domains } : {}),
        ...(entry.profiles?.length ? { profiles: entry.profiles } : {}),
      })),
    };
  }

  async getPermissionConfig(): Promise<HarnessPermissionConfig> {
    return (await this.#loadSettings()).permissions;
  }

  async runHooks(
    eventName: BridgeHookEventName,
    subject: string,
    payload: Record<string, unknown>,
  ): Promise<HookExecutionResult> {
    const settings = await this.#loadSettings();
    const commands = resolveHookEventNames(eventName)
      .flatMap((configuredEventName) =>
        (settings.hooks[configuredEventName] ?? [])
          .filter((group) => matchesHarnessPattern(group.matcher?.trim() || "*", subject))
          .flatMap((group) => group.hooks ?? [])
          .filter((hook): hook is HookHandler => hook.type === "command" && Boolean(hook.command))
          .map((hook) => ({ command: hook.command, eventName: configuredEventName })),
      );

    const deduped = Array.from(new Map(commands.map((command) => [command.command, command])).values());
    const results = await Promise.all(
      deduped.map(({ command, eventName: configuredEventName }) =>
        this.#executeHookCommand(command, {
          eventName: configuredEventName,
          subject,
          workspaceRoot: this.#workspaceRoot,
          timestamp: new Date().toISOString(),
          payload,
        }),
      ),
    );

    const denied = results.find((result) => result.decision === "deny");
    if (denied) {
      throw new Error(denied.reason ?? `Blocked by ${eventName} hook.`);
    }

    return {
      appendPrompt: results.flatMap((result) => (result.appendPrompt ? [result.appendPrompt] : [])),
    };
  }

  async #loadSettings(): Promise<{
    permissions: HarnessPermissionConfig;
    hooks: Partial<Record<BridgeHookEventName, HookMatcherGroup[]>>;
    sources: string[];
  }> {
    const files = [resolve(this.#userRoot, "settings.json")];
    if (this.#workspaceRoot) {
      files.push(resolve(this.#workspaceRoot, ".codex/settings.json"));
      files.push(resolve(this.#workspaceRoot, ".codex/settings.local.json"));
    }
    const settings: HarnessPermissionConfig = {
      defaultMode: DEFAULT_HARNESS_PERMISSIONS.defaultMode,
      allow: [...DEFAULT_HARNESS_PERMISSIONS.allow],
      ask: [...DEFAULT_HARNESS_PERMISSIONS.ask],
      deny: [...DEFAULT_HARNESS_PERMISSIONS.deny],
    };
    const hooks: Partial<Record<BridgeHookEventName, HookMatcherGroup[]>> = {};
    const sources: string[] = [];

    for (const path of files) {
      const parsed = await this.#readJsonFile<HarnessSettingsFile>(path);
      if (!parsed) {
        continue;
      }

      sources.push(path);
      if (parsed.permissions?.defaultMode) {
        settings.defaultMode = parsed.permissions.defaultMode;
      }
      if (parsed.permissions?.allow) {
        settings.allow.push(...parsed.permissions.allow);
      }
      if (parsed.permissions?.ask) {
        settings.ask.push(...parsed.permissions.ask);
      }
      if (parsed.permissions?.deny) {
        settings.deny.push(...parsed.permissions.deny);
      }

      for (const [eventName, groups] of Object.entries(parsed.hooks ?? {})) {
        const key = eventName as BridgeHookEventName;
        hooks[key] = [...(hooks[key] ?? []), ...(groups ?? [])];
      }
    }

    settings.allow = Array.from(new Set(settings.allow));
    settings.ask = Array.from(new Set(settings.ask));
    settings.deny = Array.from(new Set(settings.deny));

    return { permissions: settings, hooks, sources };
  }

  async #loadInstructionEntries(): Promise<InstructionEntry[]> {
    const entries: InstructionEntry[] = [];
    const files: Array<{ path: string; scope: WorkspaceInstructionScope; kind: "memory" | "rule"; title: string }> = [];

    const memoryCandidates: Array<{ path: string; scope: WorkspaceInstructionScope; title: string }> = [
      { path: resolve(this.#userRoot, "CODEX.md"), scope: "user", title: "User CODEX.md" },
    ];
    if (this.#workspaceRoot) {
      memoryCandidates.push(
        { path: resolve(this.#workspaceRoot, "CODEX.md"), scope: "project" as const, title: "Project CODEX.md" },
        { path: resolve(this.#workspaceRoot, ".codex/CODEX.md"), scope: "project" as const, title: ".codex/CODEX.md" },
        {
          path: resolve(this.#workspaceRoot, ".codex/CODEX.local.md"),
          scope: "local" as const,
          title: ".codex/CODEX.local.md",
        },
      );
    }

    for (const candidate of memoryCandidates) {
      if (await fileExists(candidate.path)) {
        files.push({ ...candidate, kind: "memory" });
      }
    }

    if (this.#workspaceRoot) {
      const ruleFiles = await walkMarkdownFiles(resolve(this.#workspaceRoot, ".codex/rules"));
      for (const path of ruleFiles) {
        files.push({
          path,
          scope: "project",
          kind: "rule",
          title: relative(this.#workspaceRoot, path),
        });
      }
    }

    for (const file of files) {
      const raw = await this.#readMarkdownWithImports(file.path);
      if (!raw.trim()) {
        continue;
      }

      const parsed = parseSimpleFrontmatter(raw);
      entries.push({
        id: `${file.kind}:${this.#workspaceRoot ? relative(this.#workspaceRoot, file.path) : basename(file.path)}`,
        title: file.title,
        path: file.path,
        kind: file.kind,
        scope: file.scope,
        content: parsed.body.trim(),
        ...(toStringArray(parsed.attributes.domains).length ? { domains: toStringArray(parsed.attributes.domains) } : {}),
        ...(toStringArray(parsed.attributes.profiles).length
          ? { profiles: toStringArray(parsed.attributes.profiles) }
          : {}),
      });
    }

    return entries;
  }

  async #loadShortcuts(): Promise<WorkspaceShortcut[]> {
    const sources: Array<{
      baseDir: string;
      source: "project" | "user";
      mode: "skill" | "command";
    }> = [
      {
        baseDir: resolve(this.#userRoot, "skills"),
        source: "user" as const,
        mode: "skill" as const,
      },
      {
        baseDir: resolve(this.#userRoot, "commands"),
        source: "user" as const,
        mode: "command" as const,
      },
    ];
    if (this.#workspaceRoot) {
      sources.unshift(
        {
          baseDir: resolve(this.#workspaceRoot, ".codex/skills"),
          source: "project" as const,
          mode: "skill" as const,
        },
        {
          baseDir: resolve(this.#workspaceRoot, ".codex/commands"),
          source: "project" as const,
          mode: "command" as const,
        },
      );
    }
    const shortcuts: WorkspaceShortcut[] = [];

    for (const source of sources) {
      const files =
        source.mode === "skill"
          ? await walkSkillFiles(source.baseDir)
          : await walkMarkdownFiles(source.baseDir);

      for (const path of files) {
        const raw = await readFile(path, "utf8").catch(() => "");
        if (!raw.trim()) {
          continue;
        }

        const parsed = parseSimpleFrontmatter(raw);
        const prompt = parsed.body.trim();
        if (!prompt) {
          continue;
        }

        const relativePath = relative(
          source.source === "project" ? this.#workspaceRoot : this.#userRoot,
          path,
        );
        const defaultName =
          source.mode === "skill" ? basename(dirname(path)) : humanizeCommandName(basename(path, extname(path)));
        const description =
          typeof parsed.attributes.description === "string"
            ? parsed.attributes.description
            : firstNonEmptyLine(prompt) || "Workspace shortcut";

        shortcuts.push({
          id: `${source.source}:${relativePath.replaceAll("\\", "/")}`,
          name: typeof parsed.attributes.name === "string" ? parsed.attributes.name : defaultName,
          prompt,
          description,
          source: source.source,
          path,
          readonly: true,
        });
      }
    }

    return shortcuts.sort((left, right) => left.name.localeCompare(right.name));
  }

  #matchesInstruction(entry: InstructionEntry, profileId: string, domains: string[]): boolean {
    const profileMatch =
      !entry.profiles?.length || entry.profiles.some((candidate) => candidate.trim().toLowerCase() === profileId.toLowerCase());
    const domainMatch =
      !entry.domains?.length ||
      entry.domains.some((candidate) =>
        domains.some((domain) => domain === candidate || domain.endsWith(`.${candidate}`)),
      );

    return profileMatch && domainMatch;
  }

  async #readMarkdownWithImports(path: string, depth = 0, seen = new Set<string>()): Promise<string> {
    if (depth > 5 || seen.has(path)) {
      return "";
    }
    seen.add(path);

    const content = await readFile(path, "utf8").catch(() => "");
    if (!content) {
      return "";
    }

    const lines = stripHtmlComments(content).split(/\r?\n/u);
    const output: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("@") && !trimmed.includes(" ")) {
        const importedPath = resolveImportPath(trimmed.slice(1), dirname(path));
        if (importedPath && (await fileExists(importedPath))) {
          const imported = await this.#readMarkdownWithImports(importedPath, depth + 1, seen);
          if (imported) {
            output.push(imported);
          }
        }
        continue;
      }

      output.push(line);
    }

    return output.join("\n");
  }

  async #readJsonFile<T>(path: string): Promise<T | null> {
    const content = await readFile(path, "utf8").catch(() => null);
    if (!content) {
      return null;
    }

    return JSON.parse(content) as T;
  }

  async #executeHookCommand(command: string, input: Record<string, unknown>): Promise<HookCommandOutput> {
    const env = createHookProcessEnv(process.env, {
      CODEX_SIDEPANEL_WORKSPACE_ROOT: this.#workspaceRoot,
      CODEX_SIDEPANEL_HOME: this.#userRoot,
      CODEX_SIDEPANEL_HOOK_EVENT: String(input.eventName ?? ""),
      CODEX_SIDEPANEL_HOOK_SUBJECT: String(input.subject ?? ""),
    });

    return new Promise<HookCommandOutput>((resolvePromise, reject) => {
      const shell = resolveHookShellCommand(command);
      const child = spawn(shell.command, shell.args, {
        cwd: this.#workspaceRoot || this.#userRoot || homedir(),
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code && code !== 0) {
          reject(new Error(`Hook command failed (${command}): ${stderr.trim() || `exit ${code}`}`));
          return;
        }

        const trimmed = stdout.trim();
        if (!trimmed) {
          resolvePromise({});
          return;
        }

        try {
          resolvePromise(JSON.parse(trimmed) as HookCommandOutput);
        } catch {
          resolvePromise({
            appendPrompt: trimmed,
          });
        }
      });

      child.stdin.write(JSON.stringify(input));
      child.stdin.end();
    });
  }
}

function resolveHookEventNames(eventName: BridgeHookEventName): BridgeHookEventName[] {
  if (eventName === "PromptSubmit") {
    return ["PromptSubmit", "UserPromptSubmit"];
  }
  if (eventName === "UserPromptSubmit") {
    return ["UserPromptSubmit", "PromptSubmit"];
  }
  return [eventName];
}

function normalizeWorkspaceRoot(value: string | null | undefined): string {
  const normalized = expandConfiguredLocalPath(value);
  return normalized ? resolve(normalized) : "";
}

function normalizeUserRoot(value: string | null | undefined): string {
  const normalized = expandConfiguredLocalPath(value);
  return normalized ? resolve(normalized) : resolveCodexSidepanelConfigDir();
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

function humanizeCommandName(value: string): string {
  return value
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function firstNonEmptyLine(value: string): string {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 120) ?? "";
}

function parseSimpleFrontmatter(content: string): ParsedFrontmatter {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return {
      attributes: {},
      body: content,
    };
  }

  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(content);
  if (!match) {
    return {
      attributes: {},
      body: content,
    };
  }

  const attributes: Record<string, string | string[]> = {};
  let currentArrayKey: string | null = null;

  const frontmatterBlock = match[1] ?? "";
  const body = match[2] ?? "";

  for (const line of frontmatterBlock.split(/\r?\n/u)) {
    const arrayItem = /^\s*-\s+(.*)$/u.exec(line);
    if (arrayItem && currentArrayKey) {
      const itemValue = arrayItem[1] ?? "";
      const current = Array.isArray(attributes[currentArrayKey]) ? (attributes[currentArrayKey] as string[]) : [];
      current.push(itemValue.trim());
      attributes[currentArrayKey] = current;
      continue;
    }

    const keyValue = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line);
    if (!keyValue) {
      currentArrayKey = null;
      continue;
    }

    const key = keyValue[1] ?? "";
    const rawValue = (keyValue[2] ?? "").trim();
    if (!rawValue) {
      attributes[key] = [];
      currentArrayKey = key;
      continue;
    }

    currentArrayKey = null;
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      attributes[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((part) => part.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      continue;
    }

    attributes[key] = rawValue.replace(/^["']|["']$/g, "");
  }

  return {
    attributes,
    body,
  };
}

function toStringArray(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).map((item) => item.trim()).filter(Boolean);
}

function stripHtmlComments(value: string): string {
  return value.replace(/<!--[\s\S]*?-->/gu, "");
}

function resolveImportPath(importRef: string, baseDir: string): string | null {
  if (!importRef) {
    return null;
  }

  if (importRef.startsWith("~/")) {
    return resolve(homedir(), importRef.slice(2));
  }

  if (importRef.startsWith("/")) {
    return importRef;
  }

  return resolve(baseDir, importRef);
}

async function walkMarkdownFiles(dir: string): Promise<string[]> {
  if (!(await fileExists(dir))) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      files.push(fullPath);
    }
  }

  return files;
}

async function walkSkillFiles(dir: string): Promise<string[]> {
  if (!(await fileExists(dir))) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      const skillFile = resolve(fullPath, "SKILL.md");
      if (await fileExists(skillFile)) {
        files.push(skillFile);
      } else {
        files.push(...(await walkSkillFiles(fullPath)));
      }
    }
  }

  return files;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}
