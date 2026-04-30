import { describe, expect, test } from "vitest";

import { resolveCodexCommand } from "../src/codex-discovery.js";

function createExecutableProbe(paths: string[]) {
  const known = new Set(paths);
  return async (path: string) => known.has(path);
}

function createDirectoryProbe(paths: string[]) {
  const known = new Set(paths);
  return async (path: string) => known.has(path);
}

describe("resolveCodexCommand", () => {
  test("falls back to PATH detection when a configured command is invalid", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "/missing/codex",
      pathValue: "/opt/homebrew/bin:/usr/bin",
      platformName: "darwin",
      homeDirectory: "/Users/example",
      isExecutable: createExecutableProbe(["/opt/homebrew/bin/codex"]),
    });

    expect(result).toEqual({
      configuredCommand: "/missing/codex",
      resolvedCommand: "/opt/homebrew/bin/codex",
      source: "path",
      configuredCommandInvalid: true,
    });
  });

  test("returns missing when no configured, env, path, or common command exists", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "",
      envCommand: "",
      pathValue: "",
      platformName: "darwin",
      homeDirectory: "/Users/empty-home",
      isExecutable: createExecutableProbe([]),
    });

    expect(result).toEqual({
      configuredCommand: "",
      resolvedCommand: "",
      source: "missing",
      configuredCommandInvalid: false,
    });
  });

  test("finds the macOS Codex app bundle when Chrome native messaging provides a minimal PATH", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "",
      envCommand: "",
      pathValue: "/usr/bin:/bin:/usr/sbin:/sbin",
      platformName: "darwin",
      homeDirectory: "/Users/example",
      isExecutable: createExecutableProbe(["/Applications/Codex.app/Contents/Resources/codex"]),
    });

    expect(result).toEqual({
      configuredCommand: "",
      resolvedCommand: "/Applications/Codex.app/Contents/Resources/codex",
      source: "common",
      configuredCommandInvalid: false,
    });
  });

  test("resolves Windows absolute commands and PATH variants with Windows path semantics", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "C:\\Users\\example\\AppData\\Local\\Programs\\Codex\\codex.exe",
      pathValue: "C:\\Tools;C:\\Windows\\System32",
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe(["C:\\Users\\example\\AppData\\Local\\Programs\\Codex\\codex.exe"]),
    });

    expect(result).toEqual({
      configuredCommand: "C:\\Users\\example\\AppData\\Local\\Programs\\Codex\\codex.exe",
      resolvedCommand: "C:\\Users\\example\\AppData\\Local\\Programs\\Codex\\codex.exe",
      source: "configured",
      configuredCommandInvalid: false,
    });
  });

  test("accepts a configured Windows install folder by resolving codex.cmd inside it", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "C:\\Users\\example\\AppData\\Roaming\\npm",
      pathValue: "C:\\Windows\\System32",
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe(["C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd"]),
      isDirectory: createDirectoryProbe(["C:\\Users\\example\\AppData\\Roaming\\npm"]),
    });

    expect(result).toEqual({
      configuredCommand: "C:\\Users\\example\\AppData\\Roaming\\npm",
      resolvedCommand: "C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd",
      source: "configured",
      configuredCommandInvalid: false,
    });
  });

  test("expands Windows environment variables in configured Codex paths", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "%APPDATA%\\npm",
      pathValue: "C:\\Windows\\System32",
      env: { APPDATA: "C:\\Users\\example\\AppData\\Roaming" },
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe(["C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd"]),
      isDirectory: createDirectoryProbe(["C:\\Users\\example\\AppData\\Roaming\\npm"]),
    });

    expect(result).toEqual({
      configuredCommand: "%APPDATA%\\npm",
      resolvedCommand: "C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd",
      source: "configured",
      configuredCommandInvalid: false,
    });
  });

  test("uses Windows Path and CODEX_BIN environment names case-insensitively", async () => {
    const result = await resolveCodexCommand({
      env: {
        Path: "C:\\Users\\example\\AppData\\Roaming\\npm;C:\\Windows\\System32",
        codex_bin: "$env:APPDATA\\npm\\codex.cmd",
        APPDATA: "C:\\Users\\example\\AppData\\Roaming",
      },
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe(["C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd"]),
    });

    expect(result).toEqual({
      configuredCommand: "",
      resolvedCommand: "C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd",
      source: "env",
      configuredCommandInvalid: false,
    });
  });

  test("finds the npm global Codex shim on Windows when Chrome provides a minimal PATH", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "",
      envCommand: "",
      pathValue: "C:\\Windows\\System32",
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe(["C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd"]),
    });

    expect(result).toEqual({
      configuredCommand: "",
      resolvedCommand: "C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd",
      source: "common",
      configuredCommandInvalid: false,
    });
  });
});
