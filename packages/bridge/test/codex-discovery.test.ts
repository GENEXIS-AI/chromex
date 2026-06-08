import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  test("prefers the standalone app-server command from PATH when it is installed", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "",
      envCommand: "",
      pathValue: "/opt/homebrew/bin:/usr/bin",
      platformName: "darwin",
      homeDirectory: "/Users/example",
      isExecutable: createExecutableProbe(["/opt/homebrew/bin/codex-app-server", "/opt/homebrew/bin/codex"]),
    });

    expect(result).toEqual({
      configuredCommand: "",
      resolvedCommand: "/opt/homebrew/bin/codex-app-server",
      source: "path",
      configuredCommandInvalid: false,
    });
  });

  test("finds the standalone app-server in the macOS Codex app bundle", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "",
      envCommand: "",
      pathValue: "/usr/bin:/bin:/usr/sbin:/sbin",
      platformName: "darwin",
      homeDirectory: "/Users/example",
      isExecutable: createExecutableProbe(["/Applications/Codex.app/Contents/Resources/codex-app-server"]),
    });

    expect(result).toEqual({
      configuredCommand: "",
      resolvedCommand: "/Applications/Codex.app/Contents/Resources/codex-app-server",
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

  test("accepts a configured Windows install folder by resolving codex-app-server.exe inside it", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "C:\\Users\\example\\AppData\\Local\\Programs\\Codex",
      pathValue: "C:\\Windows\\System32",
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe(["C:\\Users\\example\\AppData\\Local\\Programs\\Codex\\codex-app-server.exe"]),
      isDirectory: createDirectoryProbe(["C:\\Users\\example\\AppData\\Local\\Programs\\Codex"]),
    });

    expect(result).toEqual({
      configuredCommand: "C:\\Users\\example\\AppData\\Local\\Programs\\Codex",
      resolvedCommand: "C:\\Users\\example\\AppData\\Local\\Programs\\Codex\\codex-app-server.exe",
      source: "configured",
      configuredCommandInvalid: false,
    });
  });

  test("accepts an unpacked Windows app-server release artifact without renaming it", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "C:\\Users\\example\\Downloads\\codex-release",
      pathValue: "C:\\Windows\\System32",
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe([
        "C:\\Users\\example\\Downloads\\codex-release\\codex-app-server-x86_64-pc-windows-msvc.exe",
      ]),
      isDirectory: createDirectoryProbe(["C:\\Users\\example\\Downloads\\codex-release"]),
    });

    expect(result).toEqual({
      configuredCommand: "C:\\Users\\example\\Downloads\\codex-release",
      resolvedCommand: "C:\\Users\\example\\Downloads\\codex-release\\codex-app-server-x86_64-pc-windows-msvc.exe",
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

  test("accepts quoted Windows Codex paths copied from PowerShell or docs", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "\"%APPDATA%\\npm\\codex.cmd\"",
      pathValue: "\"C:\\Users\\example\\AppData\\Roaming\\npm\";C:\\Windows\\System32",
      env: { APPDATA: "C:\\Users\\example\\AppData\\Roaming" },
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe(["C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd"]),
    });

    expect(result).toEqual({
      configuredCommand: "%APPDATA%\\npm\\codex.cmd",
      resolvedCommand: "C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd",
      source: "configured",
      configuredCommandInvalid: false,
    });
  });

  test("accepts quoted CODEX_BIN values on Windows", async () => {
    const result = await resolveCodexCommand({
      env: {
        CODEX_BIN: "'$env:APPDATA\\npm\\codex.cmd'",
        APPDATA: "C:\\Users\\example\\AppData\\Roaming",
      },
      pathValue: "C:\\Windows\\System32",
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

  test("finds the standalone Windows app-server when Chrome provides a minimal PATH", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "",
      envCommand: "",
      pathValue: "C:\\Windows\\System32",
      env: {
        LOCALAPPDATA: "C:\\Users\\example\\AppData\\Local",
      },
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe(["C:\\Users\\example\\AppData\\Local\\Programs\\Codex\\codex-app-server.exe"]),
    });

    expect(result).toEqual({
      configuredCommand: "",
      resolvedCommand: "C:\\Users\\example\\AppData\\Local\\Programs\\Codex\\codex-app-server.exe",
      source: "common",
      configuredCommandInvalid: false,
    });
  });

  test("finds common Windows package-manager shims when Chrome provides a minimal PATH", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "",
      envCommand: "",
      pathValue: "C:\\Windows\\System32",
      env: {
        LOCALAPPDATA: "C:\\Users\\example\\AppData\\Local",
        APPDATA: "C:\\Users\\example\\AppData\\Roaming",
        PNPM_HOME: "C:\\Users\\example\\AppData\\Local\\pnpm",
        USERPROFILE: "C:\\Users\\example",
      },
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe(["C:\\Users\\example\\AppData\\Local\\pnpm\\codex.cmd"]),
    });

    expect(result).toEqual({
      configuredCommand: "",
      resolvedCommand: "C:\\Users\\example\\AppData\\Local\\pnpm\\codex.cmd",
      source: "common",
      configuredCommandInvalid: false,
    });
  });

  test("prefers Windows runnable extensions when resolving codex from PATH", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "",
      envCommand: "",
      pathValue: "C:\\Users\\example\\AppData\\Roaming\\npm;C:\\Windows\\System32",
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe([
        "C:\\Users\\example\\AppData\\Roaming\\npm\\codex",
        "C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd",
      ]),
    });

    expect(result).toEqual({
      configuredCommand: "",
      resolvedCommand: "C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd",
      source: "path",
      configuredCommandInvalid: false,
    });
  });

  test("prefers the runnable Windows npm cmd shim over the no-extension shell shim", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "C:\\Users\\example\\AppData\\Roaming\\npm\\codex",
      pathValue: "C:\\Windows\\System32",
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe([
        "C:\\Users\\example\\AppData\\Roaming\\npm\\codex",
        "C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd",
      ]),
    });

    expect(result).toEqual({
      configuredCommand: "C:\\Users\\example\\AppData\\Roaming\\npm\\codex",
      resolvedCommand: "C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd",
      source: "configured",
      configuredCommandInvalid: false,
    });
  });

  test("does not treat a Windows no-extension npm shell shim as runnable by itself", async () => {
    const result = await resolveCodexCommand({
      configuredCommand: "C:\\Users\\example\\AppData\\Roaming\\npm\\codex",
      envCommand: "",
      pathValue: "C:\\Windows\\System32",
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
      isExecutable: createExecutableProbe(["C:\\Users\\example\\AppData\\Roaming\\npm\\codex"]),
    });

    expect(result).toEqual({
      configuredCommand: "C:\\Users\\example\\AppData\\Roaming\\npm\\codex",
      resolvedCommand: "",
      source: "missing",
      configuredCommandInvalid: true,
    });
  });

  test("detects a Windows npm cmd shim by file existence even when execute bits are absent", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "chromex-codex-shim-"));
    const shimPath = join(tempDir, "codex.cmd");
    await writeFile(shimPath, "@echo off\r\n");
    await chmod(shimPath, 0o600);

    const result = await resolveCodexCommand({
      configuredCommand: shimPath,
      envCommand: "",
      pathValue: "",
      platformName: "win32",
      homeDirectory: "C:\\Users\\example",
    });

    expect(result).toEqual({
      configuredCommand: shimPath,
      resolvedCommand: shimPath,
      source: "configured",
      configuredCommandInvalid: false,
    });
  });
});
