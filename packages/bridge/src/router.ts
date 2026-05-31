import { getProfileTemplate, listProfileTemplates } from "@codex-sidepanel/shared";

import type { BridgeDiagnostics } from "./diagnostics.js";
import type { BridgeDependencies, BridgeEvent, BridgeRequest, BridgeResponse } from "./types.js";

export class BridgeRpcRouter {
  readonly #dependencies: BridgeDependencies;
  readonly #diagnostics: BridgeDiagnostics | undefined;
  #notificationSink?: (event: BridgeEvent) => void;

  constructor(dependencies: BridgeDependencies, options: { diagnostics?: BridgeDiagnostics } = {}) {
    this.#dependencies = dependencies;
    this.#diagnostics = options.diagnostics ?? dependencies.diagnostics;
  }

  setNotificationSink(sink: (event: BridgeEvent) => void): void {
    this.#notificationSink = sink;
  }

  async handle(
    request: BridgeRequest,
    options?: { emit?: (event: BridgeEvent) => void },
  ): Promise<BridgeResponse> {
    const emit = options?.emit ?? this.#notificationSink ?? (() => undefined);

    try {
      await this.#record("rpc.request", summarizeBridgeRequest(request));
      switch (request.method) {
        case "account.status":
          return { id: request.id, result: await this.#dependencies.codex.accountStatus() };
        case "account.login.start":
          return { id: request.id, result: await this.#dependencies.codex.login(request.params as never) };
        case "account.login.cancel":
          await this.#dependencies.codex.cancelLogin(request.params as never);
          return { id: request.id, result: {} };
        case "account.logout":
          await this.#dependencies.codex.logout();
          return { id: request.id, result: {} };
        case "account.rate_limits.read":
          return { id: request.id, result: await this.#dependencies.codex.readRateLimits() };
        case "model.list":
          return { id: request.id, result: await this.#dependencies.codex.listModels() };
        case "thread.list":
          return { id: request.id, result: await this.#dependencies.codex.listThreads(request.params as never) };
        case "thread.read":
          return { id: request.id, result: await this.#dependencies.codex.readThread(request.params as never) };
        case "thread.turns.list":
          return { id: request.id, result: await this.#dependencies.codex.listTurns(request.params as never) };
        case "goal.set":
          return { id: request.id, result: await this.#dependencies.codex.setGoal(request.params as never) };
        case "goal.get":
          return { id: request.id, result: await this.#dependencies.codex.getGoal(request.params as never) };
        case "goal.clear":
          return { id: request.id, result: await this.#dependencies.codex.clearGoal(request.params as never) };
        case "plan.user_input.respond":
          return {
            id: request.id,
            result: await this.#dependencies.codex.respondToUserInputRequest(request.params as never),
          };
        case "session.open":
          return { id: request.id, result: await this.#dependencies.codex.openSession(request.params as never) };
        case "session.resume":
          return {
            id: request.id,
            result: await this.#dependencies.codex.resumeSession(request.params as never),
          };
        case "prompt.send":
          return {
            id: request.id,
            result: await this.#dependencies.codex.sendPrompt(request.params as never, emit),
          };
        case "thread.compact.start":
          return {
            id: request.id,
            result: await this.#dependencies.codex.compactThread(request.params as never),
          };
        case "route.plan":
          return {
            id: request.id,
            result: await this.#dependencies.route.plan(request.params as never, emit),
          };
        case "browser.action.plan":
          return {
            id: request.id,
            result: await this.#dependencies.browserAction.plan(request.params as never, emit),
          };
        case "turn.steer":
          return {
            id: request.id,
            result: await this.#dependencies.codex.steerTurn(request.params as never),
          };
        case "turn.interrupt":
          return {
            id: request.id,
            result: await this.#dependencies.codex.interruptTurn(request.params as never),
          };
        case "image.generate.start":
          return { id: request.id, result: await this.#dependencies.image.startGenerate(request.params as never, emit) };
        case "image.edit.start":
          return { id: request.id, result: await this.#dependencies.image.startEdit(request.params as never) };
        case "image.edit.preview":
          return { id: request.id, result: await this.#dependencies.image.previewEdit(request.params as never) };
        case "image.asset.read":
          return { id: request.id, result: await this.#dependencies.image.readAsset(request.params as never) };
        case "image.asset.delete":
          return { id: request.id, result: await this.#dependencies.image.deleteAsset(request.params as never) };
        case "image.asset.folder":
          return { id: request.id, result: await this.#dependencies.image.describeAssetFolder() };
        case "image.asset.folder.open":
          return { id: request.id, result: await this.#dependencies.image.openAssetFolder(request.params as never) };
        case "local.file.reveal":
          return { id: request.id, result: await this.#dependencies.localFiles.reveal(request.params as never) };
        case "diagnostics.log.write":
          await this.#requireDiagnostics().record(
            String((request.params as { event?: unknown }).event ?? "extension.event"),
            ((request.params as { details?: unknown }).details as Record<string, unknown> | undefined) ?? {},
          );
          return { id: request.id, result: { ok: true } };
        case "diagnostics.log.folder":
          return { id: request.id, result: await this.#requireDiagnostics().describeLogFolder() };
        case "diagnostics.log.folder.open":
          return { id: request.id, result: await this.#requireDiagnostics().openLogFolder(request.params as never) };
        case "voice.session.start":
          return { id: request.id, result: await this.#dependencies.voice.start(request.params as never, emit) };
        case "dictation.transcription.start":
          return { id: request.id, result: await this.#dependencies.voice.start(request.params as never, emit) };
        case "voice.session.append_text":
          await this.#dependencies.voice.appendText(request.params as never);
          return { id: request.id, result: {} };
        case "voice.session.append_audio":
          await this.#dependencies.voice.appendAudio(request.params as never);
          return { id: request.id, result: {} };
        case "dictation.transcription.append_audio":
          await this.#dependencies.voice.appendAudio(request.params as never);
          return { id: request.id, result: {} };
        case "voice.session.stop":
          await this.#dependencies.voice.stop(request.params as never);
          return { id: request.id, result: {} };
        case "dictation.transcription.stop":
          await this.#dependencies.voice.stop(request.params as never);
          return { id: request.id, result: {} };
        case "translation.api_key.save":
          return {
            id: request.id,
            result: await this.#dependencies.translation.saveApiKey(request.params as never),
          };
        case "translation.api_key.clear":
          return {
            id: request.id,
            result: await this.#dependencies.translation.clearApiKey(),
          };
        case "translation.client_secret.create":
          return {
            id: request.id,
            result: await this.#dependencies.translation.createClientSecret(request.params as never),
          };
        case "profile.list":
          return { id: request.id, result: listProfileTemplates() };
        case "profile.select":
          return {
            id: request.id,
            result: getProfileTemplate((request.params as { id: string }).id),
          };
        case "skills.list": {
          const params = (request.params as { cwd?: string; forceReload?: boolean; extraUserRoots?: string[] }) ?? {};
          const extraUserRoots = params.extraUserRoots?.length
            ? params.extraUserRoots
            : await this.#dependencies.workspace.listExternalSkillRoots();
          return {
            id: request.id,
            result: await this.#dependencies.codex.listSkills({ ...params, extraUserRoots }),
          };
        }
        case "skills.external.list":
          return { id: request.id, result: await this.#dependencies.workspace.listExternalSkills(request.params as never) };
        case "skills.archive.install":
          return { id: request.id, result: await this.#dependencies.workspace.installSkillArchive(request.params as never) };
        case "apps.list":
          return { id: request.id, result: await this.#dependencies.codex.listApps(request.params as never) };
        case "plugins.list":
          return { id: request.id, result: await this.#dependencies.codex.listPlugins(request.params as never) };
        case "mcp.servers.list":
          return { id: request.id, result: await this.#dependencies.codex.listMcpServers(request.params as never) };
        case "mcp.oauth.login.start":
          return { id: request.id, result: await this.#dependencies.codex.startMcpOauthLogin(request.params as never) };
        case "mcp.tool.call":
          return { id: request.id, result: await this.#dependencies.codex.callMcpTool(request.params as never) };
        case "mcp.servers.reload":
          return { id: request.id, result: await this.#dependencies.codex.reloadMcpServers() };
        case "workspace.harness.read":
          return {
            id: request.id,
            result: await this.#dependencies.workspace.readHarness(),
          };
        case "runtime.config.read":
          return {
            id: request.id,
            result: await this.#dependencies.workspace.readConfig(),
          };
        case "runtime.config.update":
          return {
            id: request.id,
            result: await this.#dependencies.workspace.updateConfig(request.params as never),
          };
        case "runtime.playwright.status":
          return {
            id: request.id,
            result: await this.#dependencies.workspace.readPlaywrightRuntime(),
          };
        case "runtime.playwright.install":
          return {
            id: request.id,
            result: await this.#dependencies.workspace.installPlaywrightRuntime(),
          };
        default:
          return {
            id: request.id,
            error: {
              message: `Unknown bridge method: ${request.method}`,
            },
          };
      }
    } catch (error) {
      await this.#record("rpc.error", {
        method: request.method,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        id: request.id,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  #requireDiagnostics(): BridgeDiagnostics {
    if (!this.#diagnostics) {
      throw new Error("Diagnostics logging is not available.");
    }
    return this.#diagnostics;
  }

  async #record(event: string, details: Record<string, unknown>): Promise<void> {
    await this.#diagnostics?.record(event, details).catch(() => undefined);
  }
}

function summarizeBridgeRequest(request: BridgeRequest): Record<string, unknown> {
  const params = request.params && typeof request.params === "object" ? (request.params as Record<string, unknown>) : {};
  return {
    id: request.id,
    method: request.method,
    paramKeys: Object.keys(params),
    ...(typeof params.message === "string" ? { messageLength: params.message.length } : {}),
    ...(typeof params.prompt === "string" ? { promptLength: params.prompt.length } : {}),
  };
}
