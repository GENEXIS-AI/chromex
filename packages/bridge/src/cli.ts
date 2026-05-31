import readline from "node:readline";

import { CodexBrowserActionPlane } from "./browser-actions.js";
import { CodexAgenticRouterPlane } from "./agentic-router.js";
import { AppServerCodexPlane, CodexImagePlane, CodexVoicePlane } from "./codex-plane.js";
import { CodexAppServerClient } from "./codex-app-server.js";
import { BridgeDiagnosticLogStore } from "./diagnostics.js";
import { BridgeHarnessRuntime } from "./harness.js";
import { BridgeImageAssetStore, resolveGeneratedImageOutputDir } from "./image-assets.js";
import { BridgeLocalFilePlane } from "./local-files.js";
import { BridgeRpcRouter } from "./router.js";
import { InMemoryBridgeSecrets } from "./secrets.js";
import { RealtimeTranslationPlane } from "./realtime-translation.js";
import { ExternalSkillArchiveStore } from "./skill-archives.js";
import { PlaywrightRuntimeManager } from "./playwright-runtime.js";
import type { BridgeRequest } from "./types.js";

const secrets = new InMemoryBridgeSecrets();
const client = new CodexAppServerClient({
  experimentalApi: true,
  enabledFeatures: ["realtime_conversation", "collaboration_modes"],
});
const harness = new BridgeHarnessRuntime();
const diagnostics = new BridgeDiagnosticLogStore();
const externalSkills = new ExternalSkillArchiveStore(harness.resolveUserPath("external-skills"));
const playwrightRuntime = new PlaywrightRuntimeManager();
const imageAssets = new BridgeImageAssetStore({
  outputDir: async () => resolveGeneratedImageOutputDir(await harness.getWorkspaceRoot()),
  diagnostics,
});
const router = new BridgeRpcRouter({
  codex: new AppServerCodexPlane({
    client,
    harness,
    secrets,
    emitEvent: emit,
    imageAssets,
    diagnostics,
  }),
  voice: new CodexVoicePlane({
    client,
    harness,
    emitEvent: emit,
    diagnostics,
  }),
  translation: new RealtimeTranslationPlane({ secrets }),
  image: new CodexImagePlane(harness, { imageAssets, diagnostics }),
  localFiles: new BridgeLocalFilePlane(),
  route: new CodexAgenticRouterPlane({
    client,
    harness,
  }),
  browserAction: new CodexBrowserActionPlane({
    client,
    harness,
  }),
  workspace: {
    readHarness: async () => harness.readSnapshot(),
    readConfig: async () => {
      const runtime = await client.inspectRuntime();
      return {
        workspaceRoot: await harness.getWorkspaceRoot(),
        codexBinPath: client.getConfiguredCommand(),
        resolvedCodexBinPath: runtime.resolvedCommand,
        codexBinSource: runtime.source,
        configuredCodexBinPathInvalid: runtime.configuredCommandInvalid,
      };
    },
    updateConfig: async (config) => {
      await harness.configure(
        typeof config.workspaceRoot === "string" ? { workspaceRoot: config.workspaceRoot } : {},
      );
      await client.configure(typeof config.codexBinPath === "string" ? { command: config.codexBinPath } : {});
      const runtime = await client.inspectRuntime();
      return {
        workspaceRoot: await harness.getWorkspaceRoot(),
        codexBinPath: client.getConfiguredCommand(),
        resolvedCodexBinPath: runtime.resolvedCommand,
        codexBinSource: runtime.source,
        configuredCodexBinPathInvalid: runtime.configuredCommandInvalid,
      };
    },
    readPlaywrightRuntime: async () => playwrightRuntime.readStatus(),
    installPlaywrightRuntime: async () => playwrightRuntime.installChromium(),
    listExternalSkills: async (params) => externalSkills.listSkills(params?.cwd ?? (await harness.getWorkspaceRoot())),
    listExternalSkillRoots: async () => externalSkills.listScanRoots(),
    installSkillArchive: async (params) =>
      externalSkills.installArchive(params, params.cwd ?? (await harness.getWorkspaceRoot())),
  },
  diagnostics,
});

void diagnostics.record("bridge.started", {
  pid: process.pid,
  node: process.version,
  platform: process.platform,
});

const lineReader = readline.createInterface({
  input: process.stdin,
});
let shuttingDown = false;

process.stdout.on("error", (error) => {
  if (handleOutputError(error)) {
    return;
  }
  throw error;
});
process.stdin.on("end", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});

lineReader.on("line", async (line) => {
  if (!line.trim()) {
    return;
  }

  const request = JSON.parse(line) as BridgeRequest;
  const response = await router.handle(request, { emit });
  writeJsonLine(response);
});

function emit(event: unknown): void {
  writeJsonLine({ event });
}

function writeJsonLine(payload: unknown): boolean {
  try {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return true;
  } catch (error) {
    if (handleOutputError(error)) {
      return false;
    }
    throw error;
  }
}

function handleOutputError(error: unknown): boolean {
  if (!isBrokenPipeError(error)) {
    return false;
  }

  void shutdown();
  return true;
}

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  lineReader.close();
  await client.shutdown().catch(() => undefined);
  process.exit(0);
}

function isBrokenPipeError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: string }).code === "EPIPE" || (error as { code?: string }).code === "ERR_STREAM_DESTROYED")
  );
}
