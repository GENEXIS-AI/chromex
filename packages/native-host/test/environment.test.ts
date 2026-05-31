import { describe, expect, test } from "vitest";

import { createBridgeProcessEnv, mergeShellProviderEnv, normalizeNativeHostPath } from "../src/index.js";

describe("createBridgeProcessEnv", () => {
  test("forwards only the allowlisted environment values needed by the bridge", () => {
    const env = createBridgeProcessEnv(
      {
        Path: "C:\\Program Files\\nodejs;C:\\Users\\example\\AppData\\Roaming\\npm",
        HOME: "/Users/example",
        COMSPEC: "C:\\Windows\\System32\\cmd.exe",
        HTTPS_PROXY: "http://proxy.internal:8080",
        OPENAI_API_KEY: "test-openai-key",
        AWS_SECRET_ACCESS_KEY: "should-not-leak",
      },
      { codexBinPath: "/opt/codex/bin/codex" },
    );

    expect(env.PATH).toBe("C:\\Program Files\\nodejs;C:\\Users\\example\\AppData\\Roaming\\npm");
    expect(env.HOME).toBe("/Users/example");
    expect(env.ComSpec).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(env.HTTPS_PROXY).toBe("http://proxy.internal:8080");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.CODEX_BIN).toBe("/opt/codex/bin/codex");
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  test("accepts quoted BRIDGE_ENTRY paths from Windows launcher environments", () => {
    expect(normalizeNativeHostPath('"C:\\Program Files\\Chromex\\bridge\\cli.js"')).toBe(
      "C:\\Program Files\\Chromex\\bridge\\cli.js",
    );
    expect(normalizeNativeHostPath("'C:\\Users\\example\\AppData\\Local\\Chromex\\bridge\\cli.js'")).toBe(
      "C:\\Users\\example\\AppData\\Local\\Chromex\\bridge\\cli.js",
    );
  });

  test("hydrates missing Codex home from the login shell environment without importing provider keys", () => {
    const merged = mergeShellProviderEnv(
      {
        HOME: "/Users/example",
        PATH: "/usr/bin:/bin",
        SHELL: "/bin/zsh",
      },
      {
        platformName: "darwin",
        shellPath: "/bin/zsh",
        spawnSyncImpl: () => ({
          status: 0,
          stdout: Buffer.from("CODEX_HOME=/Users/example/.codex\u0000OPENAI_API_KEY=from-shell\u0000"),
        }),
      },
    );

    expect(merged.CODEX_HOME).toBe("/Users/example/.codex");
    expect(merged.OPENAI_API_KEY).toBeUndefined();
  });

  test("does not override Codex home when it is already present", () => {
    const merged = mergeShellProviderEnv(
      {
        HOME: "/Users/example",
        PATH: "/usr/bin:/bin",
        SHELL: "/bin/zsh",
        CODEX_HOME: "/custom/codex",
      },
      {
        platformName: "darwin",
        shellPath: "/bin/zsh",
        spawnSyncImpl: () => ({
          status: 0,
          stdout: Buffer.from("CODEX_HOME=/Users/example/.codex\u0000"),
        }),
      },
    );

    expect(merged.CODEX_HOME).toBe("/custom/codex");
  });
});
