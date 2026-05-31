import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "vitest";

import { BridgeHarnessRuntime, createHookProcessEnv } from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("BridgeHarnessRuntime", () => {
  test("loads hierarchical settings, markdown rules, and workspace shortcuts", async () => {
    const workspaceRoot = await createTempDir("workspace");
    const userRoot = await createTempDir("user");

    await mkdir(join(workspaceRoot, ".codex/hooks"), { recursive: true });
    await mkdir(join(workspaceRoot, ".codex/rules"), { recursive: true });
    await mkdir(join(workspaceRoot, ".codex/skills/review-page"), { recursive: true });
    await mkdir(join(workspaceRoot, ".codex/commands"), { recursive: true });
    await mkdir(join(workspaceRoot, "docs"), { recursive: true });

    await writeFile(
      join(workspaceRoot, ".codex/settings.json"),
      JSON.stringify({
        permissions: {
          defaultMode: "plan",
          allow: ["prompt.send"],
          ask: ["context.history.read"],
        },
        hooks: {
          UserPromptSubmit: [
            {
              matcher: "profile:*",
              hooks: [
                {
                  type: "command",
                  command: "node ./.codex/hooks/append-user-prompt.mjs",
                },
              ],
            },
          ],
          PromptSubmit: [
            {
              matcher: "profile:*",
              hooks: [
                {
                  type: "command",
                  command: "node ./.codex/hooks/append-prompt.mjs",
                },
              ],
            },
          ],
        },
      }),
    );
    await writeFile(join(workspaceRoot, "docs/usage.md"), "Use `npm run build` before release.\n");
    await writeFile(join(workspaceRoot, "CODEX.md"), "# Project Memory\n@docs/usage.md\n");
    await writeFile(
      join(workspaceRoot, ".codex/rules/youtube.md"),
      [
        "---",
        'domains: ["youtube.com", "youtu.be"]',
        'profiles: ["youtube-summarizer"]',
        "---",
        "Always produce timestamped notes for videos.",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(workspaceRoot, ".codex/skills/review-page/SKILL.md"),
      [
        "---",
        'description: Review the active page for UX and messaging quality',
        "---",
        "Review the current page for UX issues, messaging gaps, and conversion friction.",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(workspaceRoot, ".codex/commands/fact-check.md"),
      "Verify the attached context against trustworthy public sources and call out uncertainty.\n",
    );
    await writeFile(
      join(workspaceRoot, ".codex/hooks/append-prompt.mjs"),
      "process.stdout.write(JSON.stringify({ appendPrompt: 'Hook note: keep the answer concise.' }));\n",
    );
    await writeFile(
      join(workspaceRoot, ".codex/hooks/append-user-prompt.mjs"),
      "process.stdout.write(JSON.stringify({ appendPrompt: 'Hook note: answer in the user language.' }));\n",
    );

    const runtime = new BridgeHarnessRuntime({ workspaceRoot, userRoot });
    const snapshot = await runtime.readSnapshot();
    const promptInstructions = await runtime.resolvePromptInstructions({
      profileId: "youtube-summarizer",
      domains: ["youtube.com"],
    });
    const hookResult = await runtime.runHooks("PromptSubmit", "profile:youtube-summarizer", {
      message: "Summarize this video.",
    });

    expect(snapshot.workspaceRoot).toBe(workspaceRoot);
    expect(snapshot.configSources).toEqual([join(workspaceRoot, ".codex/settings.json")]);
    expect(snapshot.permissions.defaultMode).toBe("plan");
    expect(snapshot.shortcuts.map((shortcut) => shortcut.name)).toEqual(["Fact Check", "review-page"]);
    expect(snapshot.instructionSources).toHaveLength(2);
    expect(promptInstructions.text).toContain("Use `npm run build` before release.");
    expect(promptInstructions.text).toContain("Always produce timestamped notes for videos.");
    expect(hookResult.appendPrompt).toEqual([
      "Hook note: keep the answer concise.",
      "Hook note: answer in the user language.",
    ]);
  });

  test("sanitizes hook environments before running workspace commands", async () => {
    const env = createHookProcessEnv(
      {
        Path: "C:\\Program Files\\nodejs;C:\\Users\\example\\AppData\\Roaming\\npm",
        HOME: "/Users/example",
        COMSPEC: "C:\\Windows\\System32\\cmd.exe",
        HTTPS_PROXY: "http://proxy.internal:8080",
        OPENAI_API_KEY: "test-openai-key",
      },
      {
        CODEX_SIDEPANEL_WORKSPACE_ROOT: "/workspace",
        CODEX_SIDEPANEL_HOME: "/home/user/.codex-sidepanel",
      },
    );

    expect(env.PATH).toBe("C:\\Program Files\\nodejs;C:\\Users\\example\\AppData\\Roaming\\npm");
    expect(env.HOME).toBe("/Users/example");
    expect(env.ComSpec).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(env.HTTPS_PROXY).toBe("http://proxy.internal:8080");
    expect(env.CODEX_SIDEPANEL_WORKSPACE_ROOT).toBe("/workspace");
    expect(env.CODEX_SIDEPANEL_HOME).toBe("/home/user/.codex-sidepanel");
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  test("normalizes quoted and environment-based workspace roots", async () => {
    const workspaceRoot = await createTempDir("quoted-workspace");
    const userRoot = await createTempDir("quoted-user");
    const quotedRuntime = new BridgeHarnessRuntime({
      workspaceRoot: `"${workspaceRoot}"`,
      userRoot: `"${userRoot}"`,
    });

    expect(await quotedRuntime.getWorkspaceRoot()).toBe(workspaceRoot);
    expect(quotedRuntime.resolveUserPath("settings.json")).toBe(join(userRoot, "settings.json"));

    const previousEnv = process.env.CODEX_TEST_WORKSPACE_ROOT;
    const previousUserEnv = process.env.CODEX_TEST_USER_ROOT;
    process.env.CODEX_TEST_WORKSPACE_ROOT = workspaceRoot;
    process.env.CODEX_TEST_USER_ROOT = userRoot;
    try {
      const percentEnvRuntime = new BridgeHarnessRuntime({
        workspaceRoot: "%CODEX_TEST_WORKSPACE_ROOT%",
        userRoot: "%CODEX_TEST_USER_ROOT%",
      });
      expect(await percentEnvRuntime.getWorkspaceRoot()).toBe(workspaceRoot);
      expect(percentEnvRuntime.resolveUserPath("settings.json")).toBe(join(userRoot, "settings.json"));

      await percentEnvRuntime.configure({
        workspaceRoot: "'$env:CODEX_TEST_WORKSPACE_ROOT'",
      });
      expect(await percentEnvRuntime.getWorkspaceRoot()).toBe(workspaceRoot);
    } finally {
      if (previousEnv === undefined) {
        delete process.env.CODEX_TEST_WORKSPACE_ROOT;
      } else {
        process.env.CODEX_TEST_WORKSPACE_ROOT = previousEnv;
      }
      if (previousUserEnv === undefined) {
        delete process.env.CODEX_TEST_USER_ROOT;
      } else {
        process.env.CODEX_TEST_USER_ROOT = previousUserEnv;
      }
    }
  });
});

async function createTempDir(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), `codex-sidepanel-${prefix}-`));
  tempDirs.push(path);
  return path;
}
