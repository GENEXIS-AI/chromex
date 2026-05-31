import { describe, expect, test } from "vitest";

import {
  resolveCodexSidepanelConfigDir,
  resolveCodexSidepanelDataDir,
  resolveDefaultDiagnosticLogDir,
  resolveDefaultGeneratedImageDir,
  resolveDefaultSecretStorePath,
  resolveHookShellCommand,
  resolveOpenFolderCommand,
  resolveRevealPathCommand,
} from "../src/platform.js";

describe("cross-platform runtime paths", () => {
  test("uses OS-native config and data roots for secrets, logs, and generated images", () => {
    expect(
      resolveDefaultSecretStorePath({
        platformName: "darwin",
        homeDirectory: "/Users/alice",
        env: {},
      }),
    ).toBe("/Users/alice/Library/Application Support/CodexSidepanel/secrets.json");
    expect(
      resolveDefaultDiagnosticLogDir({
        platformName: "linux",
        homeDirectory: "/home/alice",
        env: { XDG_DATA_HOME: "/data" },
      }),
    ).toBe("/data/codex-sidepanel/Logs");
    expect(
      resolveDefaultGeneratedImageDir({
        platformName: "win32",
        homeDirectory: "C:\\Users\\Alice",
        env: { LocalAppData: "C:\\Users\\Alice\\AppData\\Local" },
      }),
    ).toBe("C:\\Users\\Alice\\AppData\\Local\\CodexSidepanel\\Generated Images");
  });

  test("falls back to safe per-user directories when platform env vars are missing", () => {
    expect(resolveCodexSidepanelConfigDir({ platformName: "linux", homeDirectory: "/home/a", env: {} })).toBe(
      "/home/a/.config/codex-sidepanel",
    );
    expect(resolveCodexSidepanelDataDir({ platformName: "linux", homeDirectory: "/home/a", env: {} })).toBe(
      "/home/a/.local/share/codex-sidepanel",
    );
    expect(resolveCodexSidepanelConfigDir({ platformName: "win32", homeDirectory: "C:\\Users\\A", env: {} })).toBe(
      "C:\\Users\\A\\AppData\\Local\\CodexSidepanel",
    );
  });

  test("uses platform-specific folder openers without shell interpolation", () => {
    expect(resolveOpenFolderCommand("/tmp/images", "darwin")).toEqual({ command: "open", args: ["/tmp/images"] });
    expect(resolveOpenFolderCommand("/tmp/images", "linux")).toEqual({ command: "xdg-open", args: ["/tmp/images"] });
    expect(resolveOpenFolderCommand("C:\\Images", "win32")).toEqual({
      command: "explorer.exe",
      args: ["C:\\Images"],
    });
  });

  test("reveals generated files with OS-specific folder commands", () => {
    expect(resolveRevealPathCommand("/tmp/images/generated.pdf", false, "darwin")).toEqual({
      command: "open",
      args: ["-R", "/tmp/images/generated.pdf"],
    });
    expect(resolveRevealPathCommand("/tmp/images/generated.pdf", false, "linux")).toEqual({
      command: "xdg-open",
      args: ["/tmp/images"],
    });
    expect(resolveRevealPathCommand("C:\\Images\\generated.pdf", false, "win32")).toEqual({
      command: "explorer.exe",
      args: ["/select,C:\\Images\\generated.pdf"],
    });
  });

  test("does not hard-code /bin/bash for Windows hook execution", () => {
    expect(resolveHookShellCommand("echo hi", { platformName: "win32", env: { COMSPEC: "C:\\Windows\\cmd.exe" } }))
      .toEqual({
        command: "C:\\Windows\\cmd.exe",
        args: ["/d", "/s", "/c", "echo hi"],
      });
    expect(resolveHookShellCommand("echo hi", { platformName: "linux", env: { SHELL: "/bin/sh" } })).toEqual({
      command: "/bin/sh",
      args: ["-c", "echo hi"],
    });
  });
});
