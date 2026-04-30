import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, test } from "vitest";

import { createCodexSpawnOptions } from "../src/codex-app-server.js";
import { BridgeHarnessRuntime, CodexAppServerClient, CodexVoicePlane, InMemoryBridgeSecrets } from "../src/index.js";
import type { BridgeEvent } from "../src/index.js";

const tempDirs: string[] = [];
const OPENAI_API_KEY_ENV_NAME = "OPENAI_API_KEY";

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

type FakeChildProcess = EventEmitter & {
  stdin: PassThrough & { writable: true };
  stdout: PassThrough;
  kill: () => boolean;
};

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function waitFor(assertion: () => void, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function createFakeChildProcess(): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess;
  child.stdin = new PassThrough() as FakeChildProcess["stdin"];
  child.stdout = new PassThrough();
  child.kill = () => true;
  return child;
}

describe("InMemoryBridgeSecrets", () => {
  test("tracks whether an OpenAI API key is available for fallback credential flows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bridge-secrets-"));
    tempDirs.push(dir);
    const secretPath = join(dir, "secrets.json");
    const store = new InMemoryBridgeSecrets({
      secretPath,
      initialOpenAiApiKey: null,
    });

    expect(store.hasOpenAiApiKey()).toBe(false);

    store.setOpenAiApiKey("test-openai-key");

    expect(store.hasOpenAiApiKey()).toBe(true);
    expect(store.getOpenAiApiKey()).toBe("test-openai-key");
    expect(JSON.parse(await readFile(secretPath, "utf8"))).toEqual({
      openAiApiKey: "test-openai-key",
    });
  });

  test("hydrates the API key from the persisted secret file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bridge-secrets-"));
    tempDirs.push(dir);
    const secretPath = join(dir, "secrets.json");
    const firstStore = new InMemoryBridgeSecrets({
      secretPath,
      initialOpenAiApiKey: null,
    });

    firstStore.setOpenAiApiKey("persisted-test-openai-key");

    const previousEnvKey = process.env[OPENAI_API_KEY_ENV_NAME];
    delete process.env[OPENAI_API_KEY_ENV_NAME];

    const secondStore = new InMemoryBridgeSecrets({
      secretPath,
    });

    if (previousEnvKey) {
      process.env[OPENAI_API_KEY_ENV_NAME] = previousEnvKey;
    }

    expect(secondStore.hasOpenAiApiKey()).toBe(true);
    expect(secondStore.getOpenAiApiKey()).toBe("persisted-test-openai-key");
  });
});

describe("Codex app-server startup", () => {
  test("runs Windows command shims through a shell so npm global codex.cmd can start", () => {
    expect(createCodexSpawnOptions("C:\\Users\\example\\AppData\\Roaming\\npm\\codex.cmd", "win32")).toEqual({
      shell: true,
    });
    expect(createCodexSpawnOptions("C:\\Users\\example\\AppData\\Roaming\\npm\\codex.bat", "win32")).toEqual({
      shell: true,
    });
    expect(createCodexSpawnOptions("C:\\Tools\\codex.exe", "win32")).toEqual({});
    expect(createCodexSpawnOptions("/usr/local/bin/codex", "darwin")).toEqual({});
  });
});

describe("CodexAppServerClient", () => {
  test("responds to concurrent app-server initiated tool-call requests independently", async () => {
    const child = createFakeChildProcess();
    const writes: Array<Record<string, unknown>> = [];
    let inputBuffer = "";

    child.stdin.on("data", (chunk: Buffer) => {
      inputBuffer += chunk.toString("utf8");
      let newlineIndex = inputBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = inputBuffer.slice(0, newlineIndex);
        inputBuffer = inputBuffer.slice(newlineIndex + 1);
        newlineIndex = inputBuffer.indexOf("\n");
        if (!line.trim()) {
          continue;
        }
        const message = JSON.parse(line) as { id?: number | string; method?: string };
        writes.push(message as Record<string, unknown>);
        if (message.id && message.method === "initialize") {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
        }
        if (message.id && message.method === "account/read") {
          child.stdout.write(
            `${JSON.stringify({
              id: message.id,
              result: { account: { type: "chatgpt" }, requiresOpenaiAuth: false },
            })}\n`,
          );
        }
      }
    });

    const client = new CodexAppServerClient({
      spawnImpl: () => child as never,
      resolveCommandImpl: async () => ({
        configuredCommand: null,
        resolvedCommand: "/opt/homebrew/bin/codex",
        source: "path",
        configuredCommandInvalid: false,
      }),
    });

    await client.request("account/read", { refreshToken: false });

    const slowGate = deferred();
    const slowStarted = deferred();
    client.onRequest(async (request) => {
      if (request.method !== "item/tool/call") {
        return undefined;
      }
      const callId = request.params?.callId;
      if (callId === "slow") {
        slowStarted.resolve();
        await slowGate.promise;
      }
      return {
        contentItems: [{ type: "inputText", text: `completed ${String(callId)}` }],
        success: true,
      };
    }, { concurrency: "parallel" });

    child.stdout.write(
      `${JSON.stringify({
        id: "tool-slow",
        method: "item/tool/call",
        params: { callId: "slow", tool: "slow_lookup", arguments: {} },
      })}\n`,
    );
    child.stdout.write(
      `${JSON.stringify({
        id: "tool-fast",
        method: "item/tool/call",
        params: { callId: "fast", tool: "fast_lookup", arguments: {} },
      })}\n`,
    );

    await slowStarted.promise;
    await waitFor(() => {
      expect(writes).toContainEqual({
        id: "tool-fast",
        result: {
          contentItems: [{ type: "inputText", text: "completed fast" }],
          success: true,
        },
      });
    });
    expect(writes.find((message) => message.id === "tool-slow")).toBeUndefined();

    slowGate.resolve();
    await waitFor(() => {
      expect(writes).toContainEqual({
        id: "tool-slow",
        result: {
          contentItems: [{ type: "inputText", text: "completed slow" }],
          success: true,
        },
      });
    });

    await client.shutdown();
  });

  test("serializes app-server initiated requests unless a handler opts into parallel execution", async () => {
    const child = createFakeChildProcess();
    const writes: Array<Record<string, unknown>> = [];
    let inputBuffer = "";

    child.stdin.on("data", (chunk: Buffer) => {
      inputBuffer += chunk.toString("utf8");
      let newlineIndex = inputBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = inputBuffer.slice(0, newlineIndex);
        inputBuffer = inputBuffer.slice(newlineIndex + 1);
        newlineIndex = inputBuffer.indexOf("\n");
        if (!line.trim()) {
          continue;
        }
        const message = JSON.parse(line) as { id?: number | string; method?: string };
        writes.push(message as Record<string, unknown>);
        if (message.id && message.method === "initialize") {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
        }
        if (message.id && message.method === "account/read") {
          child.stdout.write(
            `${JSON.stringify({
              id: message.id,
              result: { account: { type: "chatgpt" }, requiresOpenaiAuth: false },
            })}\n`,
          );
        }
      }
    });

    const client = new CodexAppServerClient({
      spawnImpl: () => child as never,
      resolveCommandImpl: async () => ({
        configuredCommand: null,
        resolvedCommand: "/opt/homebrew/bin/codex",
        source: "path",
        configuredCommandInvalid: false,
      }),
    });

    await client.request("account/read", { refreshToken: false });

    const slowGate = deferred();
    const slowStarted = deferred();
    client.onRequest(async (request) => {
      if (request.method !== "item/tool/call") {
        return undefined;
      }
      const callId = request.params?.callId;
      if (callId === "slow-image-reference") {
        slowStarted.resolve();
        await slowGate.promise;
      }
      return {
        contentItems: [{ type: "inputText", text: `completed ${String(callId)}` }],
        success: true,
      };
    });

    child.stdout.write(
      `${JSON.stringify({
        id: "tool-slow-image-reference",
        method: "item/tool/call",
        params: { callId: "slow-image-reference", tool: "image_reference_edit", arguments: {} },
      })}\n`,
    );
    child.stdout.write(
      `${JSON.stringify({
        id: "tool-fast-image-reference",
        method: "item/tool/call",
        params: { callId: "fast-image-reference", tool: "image_reference_edit", arguments: {} },
      })}\n`,
    );

    await slowStarted.promise;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writes.find((message) => message.id === "tool-fast-image-reference")).toBeUndefined();

    slowGate.resolve();
    await waitFor(() => {
      expect(writes).toContainEqual({
        id: "tool-slow-image-reference",
        result: {
          contentItems: [{ type: "inputText", text: "completed slow-image-reference" }],
          success: true,
        },
      });
      expect(writes).toContainEqual({
        id: "tool-fast-image-reference",
        result: {
          contentItems: [{ type: "inputText", text: "completed fast-image-reference" }],
          success: true,
        },
      });
    });

    await client.shutdown();
  });

  test("retries app-server overload responses with backoff before resolving", async () => {
    const child = createFakeChildProcess();
    const writes: Array<Record<string, unknown>> = [];
    const delays: number[] = [];
    let accountReadAttempts = 0;
    let inputBuffer = "";

    child.stdin.on("data", (chunk: Buffer) => {
      inputBuffer += chunk.toString("utf8");
      let newlineIndex = inputBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = inputBuffer.slice(0, newlineIndex);
        inputBuffer = inputBuffer.slice(newlineIndex + 1);
        newlineIndex = inputBuffer.indexOf("\n");
        if (!line.trim()) {
          continue;
        }
        const message = JSON.parse(line) as { id?: number; method?: string };
        writes.push(message as Record<string, unknown>);
        if (message.id && message.method === "initialize") {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
        }
        if (message.id && message.method === "account/read") {
          accountReadAttempts += 1;
          if (accountReadAttempts === 1) {
            child.stdout.write(
              `${JSON.stringify({
                id: message.id,
                error: { code: -32001, message: "Server overloaded; retry later." },
              })}\n`,
            );
          } else {
            child.stdout.write(
              `${JSON.stringify({
                id: message.id,
                result: { account: { type: "chatgpt" }, requiresOpenaiAuth: false },
              })}\n`,
            );
          }
        }
      }
    });

    const client = new CodexAppServerClient({
      spawnImpl: () => child as never,
      resolveCommandImpl: async () => ({
        configuredCommand: null,
        resolvedCommand: "/opt/homebrew/bin/codex",
        source: "path",
        configuredCommandInvalid: false,
      }),
      retryDelayImpl: async (delayMs) => {
        delays.push(delayMs);
      },
      randomImpl: () => 0,
    });

    await expect(client.request("account/read", { refreshToken: false })).resolves.toEqual({
      account: { type: "chatgpt" },
      requiresOpenaiAuth: false,
    });

    expect(writes.filter((message) => message.method === "account/read")).toHaveLength(2);
    expect(delays).toEqual([100]);

    await client.shutdown();
  });

  test("opts into experimental app-server APIs when configured", async () => {
    const child = createFakeChildProcess();
    const writes: Array<Record<string, unknown>> = [];
    let spawnedArgs: string[] | null = null;
    let inputBuffer = "";

    child.stdin.on("data", (chunk: Buffer) => {
      inputBuffer += chunk.toString("utf8");
      let newlineIndex = inputBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = inputBuffer.slice(0, newlineIndex);
        inputBuffer = inputBuffer.slice(newlineIndex + 1);
        newlineIndex = inputBuffer.indexOf("\n");
        if (!line.trim()) {
          continue;
        }
        const message = JSON.parse(line) as { id?: number; method?: string };
        writes.push(message as Record<string, unknown>);
        if (message.id && message.method === "initialize") {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
        }
        if (message.id && message.method === "account/read") {
          child.stdout.write(
            `${JSON.stringify({
              id: message.id,
              result: { account: { type: "chatgpt" }, requiresOpenaiAuth: false },
            })}\n`,
          );
        }
      }
    });

    const client = new CodexAppServerClient({
      experimentalApi: true,
      enabledFeatures: ["realtime_conversation", "realtime_conversation"],
      spawnImpl: (_command, args) => {
        spawnedArgs = args ?? [];
        return child as never;
      },
      resolveCommandImpl: async () => ({
        configuredCommand: null,
        resolvedCommand: "/opt/homebrew/bin/codex",
        source: "path",
        configuredCommandInvalid: false,
      }),
    });

    await expect(client.request("account/read", { refreshToken: false })).resolves.toEqual({
      account: { type: "chatgpt" },
      requiresOpenaiAuth: false,
    });

    expect(writes[0]).toMatchObject({
      method: "initialize",
      params: {
        capabilities: {
          experimentalApi: true,
        },
      },
    });
    expect(spawnedArgs).toEqual([
      "app-server",
      "--enable",
      "realtime_conversation",
      "--listen",
      "stdio://",
    ]);

    await client.shutdown();
  });

  test("starts app-server realtime voice with a WebRTC SDP offer", async () => {
    const child = createFakeChildProcess();
    const writes: Array<Record<string, unknown>> = [];
    let inputBuffer = "";

    child.stdin.on("data", (chunk: Buffer) => {
      inputBuffer += chunk.toString("utf8");
      let newlineIndex = inputBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = inputBuffer.slice(0, newlineIndex);
        inputBuffer = inputBuffer.slice(newlineIndex + 1);
        newlineIndex = inputBuffer.indexOf("\n");
        if (!line.trim()) {
          continue;
        }
        const message = JSON.parse(line) as { id?: number; method?: string; params?: Record<string, unknown> };
        writes.push(message as Record<string, unknown>);
        if (message.id && message.method === "initialize") {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
        }
        if (message.id && message.method === "account/read") {
          child.stdout.write(
            `${JSON.stringify({
              id: message.id,
              result: { account: { type: "chatgpt" }, requiresOpenaiAuth: false },
            })}\n`,
          );
        }
        if (message.id && message.method === "thread/start") {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: { thread: { id: "thread-voice" } } })}\n`);
        }
        if (message.id && message.method === "thread/realtime/start") {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
          child.stdout.write(
            `${JSON.stringify({
              method: "thread/realtime/sdp",
              params: { threadId: "thread-voice", sdp: "answer-sdp" },
            })}\n`,
          );
          child.stdout.write(
            `${JSON.stringify({
              method: "thread/realtime/started",
              params: { threadId: "thread-voice", sessionId: "voice-session-1", version: "v1" },
            })}\n`,
          );
        }
      }
    });

    const client = new CodexAppServerClient({
      experimentalApi: true,
      spawnImpl: () => child as never,
      resolveCommandImpl: async () => ({
        configuredCommand: null,
        resolvedCommand: "/opt/homebrew/bin/codex",
        source: "path",
        configuredCommandInvalid: false,
      }),
    });
    const userRoot = await mkdtemp(join(tmpdir(), "voice-user-"));
    tempDirs.push(userRoot);
    const emitted: BridgeEvent[] = [];
    const voice = new CodexVoicePlane({
      client,
      harness: new BridgeHarnessRuntime({ userRoot }),
      emitEvent: (event) => emitted.push(event),
    });

    const state = await voice.start({ sdp: "offer-sdp", voice: "sage" });

    expect(["connecting", "active"]).toContain(state.status);
    expect(state).toMatchObject({
      threadId: "thread-voice",
      transport: "webrtc",
      outputModality: "audio",
    });
    expect(writes.find((message) => message.method === "thread/start")).toMatchObject({
      params: {
        ephemeral: true,
        serviceName: "codex-chrome-sidepanel-voice",
      },
    });
    expect(writes.find((message) => message.method === "thread/realtime/start")).toMatchObject({
      params: {
        threadId: "thread-voice",
        outputModality: "audio",
        voice: "sage",
        transport: {
          type: "webrtc",
          sdp: "offer-sdp",
        },
      },
    });
    expect(emitted).toContainEqual({
      type: "voice.sdp",
      threadId: "thread-voice",
      sdp: "answer-sdp",
    });

    await client.shutdown();
  });

  test("starts app-server realtime voice over websocket and appends spoken text", async () => {
    const child = createFakeChildProcess();
    const writes: Array<Record<string, unknown>> = [];
    let inputBuffer = "";

    child.stdin.on("data", (chunk: Buffer) => {
      inputBuffer += chunk.toString("utf8");
      let newlineIndex = inputBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = inputBuffer.slice(0, newlineIndex);
        inputBuffer = inputBuffer.slice(newlineIndex + 1);
        newlineIndex = inputBuffer.indexOf("\n");
        if (!line.trim()) {
          continue;
        }
        const message = JSON.parse(line) as { id?: number; method?: string; params?: Record<string, unknown> };
        writes.push(message as Record<string, unknown>);
        if (message.id && message.method === "initialize") {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
        }
        if (message.id && message.method === "account/read") {
          child.stdout.write(
            `${JSON.stringify({
              id: message.id,
              result: { account: { type: "chatgpt" }, requiresOpenaiAuth: false },
            })}\n`,
          );
        }
        if (message.id && message.method === "thread/start") {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: { thread: { id: "thread-voice" } } })}\n`);
        }
        if (message.id && message.method === "thread/realtime/start") {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
          child.stdout.write(
            `${JSON.stringify({
              method: "thread/realtime/started",
              params: { threadId: "thread-voice", sessionId: "voice-session-1", version: "v2" },
            })}\n`,
          );
        }
        if (message.id && message.method === "thread/realtime/appendText") {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
        }
        if (message.id && message.method === "thread/realtime/appendAudio") {
          child.stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
        }
      }
    });

    const client = new CodexAppServerClient({
      experimentalApi: true,
      spawnImpl: () => child as never,
      resolveCommandImpl: async () => ({
        configuredCommand: null,
        resolvedCommand: "/opt/homebrew/bin/codex",
        source: "path",
        configuredCommandInvalid: false,
      }),
    });
    const userRoot = await mkdtemp(join(tmpdir(), "voice-user-"));
    tempDirs.push(userRoot);
    const emitted: BridgeEvent[] = [];
    const voice = new CodexVoicePlane({
      client,
      harness: new BridgeHarnessRuntime({ userRoot }),
      emitEvent: (event) => emitted.push(event),
    });

    const state = await voice.start({ voice: "sage" });
    await voice.appendText({ text: "Hello Codex." });
    await voice.appendAudio({
      audio: {
        data: "AQID",
        sampleRate: 24_000,
        numChannels: 1,
        samplesPerChannel: 3,
      },
    });

    expect(state).toMatchObject({
      threadId: "thread-voice",
      transport: "websocket",
      outputModality: "audio",
    });
    expect(writes.find((message) => message.method === "thread/realtime/start")).toMatchObject({
      params: {
        threadId: "thread-voice",
        outputModality: "audio",
        voice: "sage",
        transport: {
          type: "websocket",
        },
      },
    });
    expect(writes.find((message) => message.method === "thread/realtime/appendText")).toMatchObject({
      params: {
        threadId: "thread-voice",
        text: "Hello Codex.",
      },
    });
    expect(writes.find((message) => message.method === "thread/realtime/appendAudio")).toMatchObject({
      params: {
        threadId: "thread-voice",
        audio: {
          data: "AQID",
          sampleRate: 24_000,
          numChannels: 1,
          samplesPerChannel: 3,
        },
      },
    });
    expect(emitted).toContainEqual({
      type: "voice.session.started",
      threadId: "thread-voice",
      sessionId: "voice-session-1",
      transport: "websocket",
    });

    await client.shutdown();
  });

  test("rejects requests cleanly when the configured codex binary cannot be spawned", async () => {
    const child = createFakeChildProcess();
    const client = new CodexAppServerClient({
      spawnImpl: (command) => {
        queueMicrotask(() => {
          child.emit("error", new Error(`spawn ${command} ENOENT`));
        });
        return child as never;
      },
      resolveCommandImpl: async () => ({
        configuredCommand: "/missing/codex",
        resolvedCommand: "/missing/codex",
        source: "configured",
        configuredCommandInvalid: false,
      }),
    });
    await client.configure({ command: "/missing/codex" });

    await expect(client.request("account/read", { refreshToken: false })).rejects.toThrow(
      'Failed to start codex app-server with "/missing/codex": spawn /missing/codex ENOENT',
    );

    await client.shutdown();
  });
});
