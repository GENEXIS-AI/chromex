import { describe, expect, test } from "vitest";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AppServerCodexPlane, CodexImagePlane, InMemoryBridgeSecrets, type BridgeEvent, type PromptSendParams } from "../src/index.js";
import { normalizeLocalImagePath } from "../src/codex-plane.js";
import { BridgeImageAssetStore, isBridgeImageAssetRef } from "../src/image-assets.js";
import type { ProfileTemplate } from "@codex-sidepanel/shared";

type NotificationPayload = {
  method: string;
  params?: Record<string, unknown>;
};

class FakeCodexClient {
  readonly handlers = new Set<(notification: NotificationPayload) => void>();
  readonly calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  constructor(
    private readonly options: {
      emitImageBeforeTurnCompleted?: boolean;
      threadReadItems?: Array<Record<string, unknown>>;
      agentText?: string;
      emitEmptyAgentCompletion?: boolean;
      imageEditMode?: boolean;
      imageGenerationItems?: Array<Record<string, unknown>>;
      turnCompletedItems?: Array<Record<string, unknown>>;
      turnStartFailures?: string[];
      appListPages?: Array<{ data?: Array<Record<string, unknown>>; nextCursor?: string | null }>;
      accountReadResult?: {
        account?: { type?: string; email?: string | null; planType?: string | null } | null;
        planType?: string | null;
        requiresOpenaiAuth?: boolean;
      };
    } = {
      emitImageBeforeTurnCompleted: true,
    },
  ) {}

  onNotification(handler: (notification: NotificationPayload) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === "account/read") {
      return this.options.accountReadResult ?? { account: { type: "chatgpt" } };
    }
    if (method === "skills/list") {
      return { data: [] };
    }
    if (method === "app/list") {
      const pages = this.options.appListPages ?? [{ data: [] }];
      const pageIndex = params?.cursor ? Number(params.cursor) : 0;
      return pages[Number.isFinite(pageIndex) ? pageIndex : 0] ?? { data: [] };
    }
    if (method === "thread/start") {
      return { thread: { id: "thread-1" } };
    }
    if (method === "thread/resume") {
      return { thread: { id: String(params?.threadId ?? "thread-1") } };
    }
    if (method === "thread/read") {
      return {
        thread: {
          id: "thread-1",
          turns: [
            {
              id: "turn-1",
              items: this.options.threadReadItems ?? [],
            },
          ],
        },
      };
    }
    if (method === "turn/start") {
      const failures = this.options.turnStartFailures ?? [];
      const turnStartCount = this.calls.filter((call) => call.method === "turn/start").length;
      const failureMessage = failures[turnStartCount - 1];
      if (failureMessage) {
        throw new Error(failureMessage);
      }
      queueMicrotask(() => {
        if (this.options.emitImageBeforeTurnCompleted !== false) {
          const imageItems = this.options.imageGenerationItems ?? [
            {
              id: "image-1",
              type: "imageGeneration",
              result: "data:image/png;base64,abc123",
            },
          ];
          for (const item of imageItems) {
            this.emit({
              method: "item/completed",
              params: {
                threadId: "thread-1",
                turnId: "turn-1",
                item,
              },
            });
          }
        }
        if (this.options.agentText) {
          this.emit({
            method: "item/completed",
            params: {
              threadId: "thread-1",
              turnId: "turn-1",
              item: {
                id: "agent-1",
                type: "agentMessage",
                text: this.options.agentText,
              },
            },
          });
        }
        if (this.options.emitEmptyAgentCompletion) {
          this.emit({
            method: "item/completed",
            params: {
              threadId: "thread-1",
              turnId: "turn-1",
              item: {
                id: "agent-from-thread",
                type: "agentMessage",
              },
            },
          });
        }
        this.emit({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", items: this.options.turnCompletedItems ?? [] },
          },
        });
      });
      return { turn: { id: "turn-1" } };
    }
    if (method === "thread/compact/start") {
      const threadId = String(params?.threadId ?? "thread-1");
      queueMicrotask(() => {
        this.emit({
          method: "turn/started",
          params: {
            threadId,
            turn: { id: "turn-compact" },
          },
        });
        this.emit({
          method: "item/started",
          params: {
            threadId,
            turnId: "turn-compact",
            item: {
              id: "compact-item-1",
              type: "contextCompaction",
            },
          },
        });
        this.emit({
          method: "item/completed",
          params: {
            threadId,
            turnId: "turn-compact",
            item: {
              id: "compact-item-1",
              type: "contextCompaction",
            },
          },
        });
        this.emit({
          method: "turn/completed",
          params: {
            threadId,
            turn: { id: "turn-compact" },
          },
        });
      });
      return {};
    }
    return {};
  }

  emit(notification: NotificationPayload): void {
    for (const handler of this.handlers) {
      handler(notification);
    }
  }
}

class ManualConcurrentCodexClient {
  readonly handlers = new Set<(notification: NotificationPayload) => void>();
  readonly calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  readonly turnStarts = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      promise: Promise<unknown>;
    }
  >();
  readonly turnStartWaiters = new Map<string, Array<() => void>>();

  onNotification(handler: (notification: NotificationPayload) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === "thread/read") {
      return {
        thread: {
          id: String(params?.threadId ?? ""),
          turns: [],
        },
      };
    }
    if (method === "turn/start") {
      const threadId = String(params?.threadId ?? "");
      const promise = new Promise<unknown>((resolve, reject) => {
        this.turnStarts.set(threadId, { resolve, reject, promise: Promise.resolve() });
      });
      const pending = this.turnStarts.get(threadId);
      if (pending) {
        pending.promise = promise;
      }
      for (const waiter of this.turnStartWaiters.get(threadId) ?? []) {
        waiter();
      }
      this.turnStartWaiters.delete(threadId);
      return promise;
    }
    return {};
  }

  async waitForTurnStart(threadId: string): Promise<void> {
    if (this.turnStarts.has(threadId)) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.turnStartWaiters.set(threadId, [...(this.turnStartWaiters.get(threadId) ?? []), resolve]);
    });
  }

  resolveTurnStart(threadId: string, turnId: string): void {
    const pending = this.turnStarts.get(threadId);
    if (!pending) {
      throw new Error(`No pending turn/start for ${threadId}`);
    }
    pending.resolve({ turn: { id: turnId } });
  }

  emit(notification: NotificationPayload): void {
    for (const handler of this.handlers) {
      handler(notification);
    }
  }
}

const profile: ProfileTemplate = {
  id: "research-assistant",
  name: "Research Assistant",
  systemPrompt: "Answer precisely.",
  defaultContextPolicy: {
    attachCurrentPageByDefault: true,
    allowedReadStrategies: ["dom"],
  },
  allowedSources: ["current-page"],
  preferredActions: [],
  adapterHints: [],
};

const harness = {
  runHooks: async () => ({ appendPrompt: [] }),
  resolvePromptInstructions: async () => ({ text: "", sources: [] }),
  getWorkspaceRoot: async () => "",
};

const promptParams: PromptSendParams = {
  profile,
  message: "Generate an image.",
  contexts: [],
};

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AppServerCodexPlane", () => {
  test("starts API-key login through the app-server and stores the key only in bridge secrets", async () => {
    const secretDir = await mkdtemp(join(tmpdir(), "chromex-api-key-test-"));
    const secrets = new InMemoryBridgeSecrets({
      secretPath: join(secretDir, "secrets.json"),
      initialOpenAiApiKey: null,
    });
    const client = new FakeCodexClient();
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets,
    });

    await plane.login({ type: "apiKey", apiKey: "sk-test" });

    expect(secrets.getOpenAiApiKey()).toBe("sk-test");
    expect(client.calls.find((call) => call.method === "account/login/start")).toMatchObject({
      params: {
        type: "apiKey",
        apiKey: "sk-test",
      },
    });
  });

  test("switches to an already configured API key without requiring Chrome to resend the key", async () => {
    const secretDir = await mkdtemp(join(tmpdir(), "chromex-api-key-reuse-test-"));
    const client = new FakeCodexClient();
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets({
        secretPath: join(secretDir, "secrets.json"),
        initialOpenAiApiKey: "sk-stored",
      }),
    });

    await plane.login({ type: "apiKey" });

    expect(client.calls.find((call) => call.method === "account/login/start")).toMatchObject({
      params: {
        type: "apiKey",
        apiKey: "sk-stored",
      },
    });
  });

  test("enables app and plugin runtime features before loading the app catalog", async () => {
    const client = new FakeCodexClient({
      appListPages: [
        {
          data: [
            {
              id: "connector_2128aebfecb84f64a069897515042a44",
              name: "Gmail",
              description: "Read Gmail",
              isAccessible: true,
              isEnabled: true,
            },
          ],
        },
      ],
    });
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
    });

    await plane.listApps({ threadId: "stale-thread" });

    expect(client.calls[0]).toEqual({
      method: "experimentalFeature/enablement/set",
      params: { enablement: { apps: true, plugins: true } },
    });
    expect(client.calls[1]).toEqual({
      method: "app/list",
      params: { limit: 100 },
    });
  });

  test("expands plugin mentions to connected app mentions before starting a turn", async () => {
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      agentText: "Done",
      appListPages: [
        {
          data: [
            {
              id: "connector_2128aebfecb84f64a069897515042a44",
              name: "Gmail",
              description: "Read Gmail",
              isAccessible: true,
              isEnabled: true,
            },
          ],
        },
      ],
    });
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
    });

    await plane.sendPrompt(
      {
        ...promptParams,
        threadId: "thread-1",
        structuredInputs: [
          {
            id: "gmail@openai-curated",
            type: "mention",
            name: "Gmail",
            path: "plugin://gmail@openai-curated",
            token: "$gmail",
          },
        ],
      },
      () => undefined,
    );

    const turnStartInput = client.calls.find((call) => call.method === "turn/start")?.params?.input as
      | Array<{ type: string; path?: string }>
      | undefined;
    expect(client.calls.find((call) => call.method === "app/list")?.params).toMatchObject({
      forceRefetch: true,
    });
    expect(turnStartInput?.filter((item) => item.type === "mention").map((item) => item.path)).toEqual([
      "app://connector_2128aebfecb84f64a069897515042a44",
      "plugin://gmail@openai-curated",
    ]);
  });

  test("allows app-server approval flow when a turn uses explicit app or plugin mentions", async () => {
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      agentText: "Done",
      appListPages: [
        {
          data: [
            {
              id: "connector_google_calendar",
              name: "Google Calendar",
              description: "Manage events",
              isAccessible: true,
              isEnabled: true,
            },
          ],
        },
      ],
    });
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
    });

    await plane.sendPrompt(
      {
        ...promptParams,
        threadId: "thread-1",
        structuredInputs: [
          {
            id: "google-calendar@openai-curated",
            type: "mention",
            name: "google-calendar",
            path: "plugin://google-calendar@openai-curated",
            token: "$google_calendar",
          },
        ],
      },
      () => undefined,
    );

    const turnStartParams = client.calls.find((call) => call.method === "turn/start")?.params;
    const turnStartInput = turnStartParams?.input as Array<{ type: string; path?: string }> | undefined;
    expect(turnStartParams?.approvalPolicy).not.toBe("never");
    expect(turnStartParams?.approvalsReviewer).toBe("auto_review");
    expect(turnStartInput?.filter((item) => item.type === "mention").map((item) => item.path)).toEqual([
      "app://connector_google_calendar",
      "plugin://google-calendar@openai-curated",
    ]);
  });

  test("reports API-key app-server accounts as authenticated multimodal-capable sessions", async () => {
    const client = new FakeCodexClient({
      accountReadResult: {
        account: { type: "apiKey" },
      },
    });
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets({ initialOpenAiApiKey: "sk-test" }),
    });

    await expect(plane.accountStatus()).resolves.toMatchObject({
      authMode: "apikey",
      codexAuthenticated: true,
      multimodalAvailable: true,
      openAiApiKeyConfigured: true,
    });
  });

  test("does not infer account plan type from non-account fields", async () => {
    const client = new FakeCodexClient({
      accountReadResult: {
        account: { type: "apiKey" },
        planType: "free",
      },
    });
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets({ initialOpenAiApiKey: "sk-test" }),
    });

    await expect(plane.accountStatus()).resolves.toMatchObject({
      authMode: "apikey",
      codexAuthenticated: true,
      planType: null,
    });
  });

  test("reports Codex account plan type when app-server exposes it", async () => {
    const client = new FakeCodexClient({
      accountReadResult: {
        account: { type: "chatgpt", email: "codex@example.com", planType: "plus" },
      },
    });
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
    });

    await expect(plane.accountStatus()).resolves.toMatchObject({
      authMode: "chatgpt",
      email: "codex@example.com",
      planType: "plus",
    });
  });

  test("resumes sessions without eagerly loading full turn history", async () => {
    const client = new FakeCodexClient();
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
    });

    await plane.resumeSession({ threadId: "thread-existing" });

    expect(client.calls.find((call) => call.method === "thread/resume")?.params).toMatchObject({
      threadId: "thread-existing",
      excludeTurns: true,
    });
  });

  test("emits generated image previews from regular Codex turns", async () => {
    const client = new FakeCodexClient();
    const imageAssets = new BridgeImageAssetStore();
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
      imageAssets,
    });
    const events: BridgeEvent[] = [];

    await plane.sendPrompt(promptParams, (event) => events.push(event));

    const imageEvent = events.find((event) => event.type === "message.image");
    expect(imageEvent).toMatchObject({
      type: "message.image",
      itemId: "image-1",
      alt: "Generated image",
    });
    expect(imageEvent?.type === "message.image" && isBridgeImageAssetRef(imageEvent.previewRef)).toBe(true);
  });

  test("materializes oversized DOM context as a local file reference", async () => {
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      agentText: "done",
    });
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
    });
    const longDom = "한국어와 English가 섞인 긴 페이지 본문입니다. ".repeat(18_000);

    await plane.sendPrompt(
      {
        profile,
        model: "gpt-5.3-codex-spark",
        message: "이 페이지를 핵심만 요약해줘.",
        contexts: [
          {
            metadata: {
              url: "https://example.com/long",
              title: "Long Page",
              domain: "example.com",
            },
            selectionText: "",
            domSummary: longDom,
            visionAssets: [],
            adapterPayload: null,
            privacyFlags: {
              containsSensitiveFormData: false,
              userConsentedToHistory: false,
            },
          },
        ],
      },
      () => undefined,
    );

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    const inputItems = Array.isArray(turnStart?.params?.input) ? turnStart.params.input : [];
    const textItem = inputItems.find(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" && item !== null && (item as { type?: unknown }).type === "text",
    );

    expect(textItem?.text).toContain("Full captured page text is available during this turn at:");
    expect(textItem?.text).toContain("OVERSIZED PAGE CONTEXT FILE");
    expect(textItem?.text.length ?? 0).toBeLessThan(longDom.length);
  });

  test("emits sanitized turn activity for public search and file work without raw chain of thought", async () => {
    const client = new FakeCodexClient();
    const events: BridgeEvent[] = [];
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
      emitEvent: (event) => events.push(event),
    });

    client.emit({
      method: "turn/started",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1" },
      },
    });
    client.emit({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          id: "reason-1",
          type: "reasoning",
          text: "private hidden reasoning must not be exposed",
        },
      },
    });
    client.emit({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          id: "search-1",
          type: "webSearch",
          query: "Codex app-server item lifecycle",
        },
      },
    });
    client.emit({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          id: "search-2",
          type: "webSearch",
          query: "site:github.com/openai/codex supports_parallel_tool_calls",
          url: "https://github.com/openai/codex/blob/main/docs/config.md",
        },
      },
    });
    client.emit({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          id: "cmd-1",
          type: "execCommand",
          command: "rg -n \"turn.activity\" packages",
        },
      },
    });

    expect(events.filter((event) => event.type === "turn.activity")).toEqual([
      expect.objectContaining({
        type: "turn.activity",
        kind: "web",
        status: "running",
        title: "Searching the web",
        detail: "Codex app-server item lifecycle",
      }),
      expect.objectContaining({
        type: "turn.activity",
        kind: "web",
        status: "completed",
        title: "Web search complete",
        detail:
          "site:github.com/openai/codex supports_parallel_tool_calls · https://github.com/openai/codex/blob/main/docs/config.md",
      }),
      expect.objectContaining({
        type: "turn.activity",
        kind: "file",
        status: "completed",
        title: "File exploration complete",
        detail: "rg -n \"turn.activity\" packages",
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("private hidden reasoning");
    expect(JSON.stringify(events)).not.toContain("Reasoning summary");
    expect(JSON.stringify(events)).not.toContain("Reviewing the request and planning the next step");
  });

  test("does not expose final-answer preparation as a noisy trace row", async () => {
    const client = new FakeCodexClient();
    const events: BridgeEvent[] = [];
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
      emitEvent: (event) => events.push(event),
    });

    client.emit({
      method: "turn/started",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1" },
      },
    });
    client.emit({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          id: "agent-1",
          type: "agentMessage",
          text: "Final answer.",
        },
      },
    });

    expect(events.filter((event) => event.type === "turn.activity")).toEqual([]);
  });

  test("recovers final assistant text from nested turn completion payloads", async () => {
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      turnCompletedItems: [
        {
          id: "agent-nested",
          type: "agentMessage",
          content: [
            {
              type: "output_text",
              content: [{ text: "Recovered from nested turn payload." }],
            },
          ],
        },
      ],
    });
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
    });
    const events: BridgeEvent[] = [];

    await plane.sendPrompt(promptParams, (event) => events.push(event));

    expect(events).toContainEqual(expect.objectContaining({
      type: "message.completed",
      itemId: "agent-nested",
      text: "Recovered from nested turn payload.",
    }));
  });

  test("does not retry a completed prompt when post-completion hooks fail", async () => {
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      agentText: "Final answer before hook failure.",
    });
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: {
        ...harness,
        runHooks: async (hook: string) => {
          if (hook === "PromptComplete") {
            throw new Error("app-server exited after prompt completion");
          }
          return { appendPrompt: [] };
        },
      } as never,
      secrets: new InMemoryBridgeSecrets(),
    });
    const events: BridgeEvent[] = [];

    await expect(plane.sendPrompt(promptParams, (event) => events.push(event))).resolves.toEqual({
      threadId: "thread-1",
      turnId: "turn-1",
    });

    expect(client.calls.filter((call) => call.method === "turn/start")).toHaveLength(1);
    expect(events.filter((event) => event.type === "message.completed")).toEqual([
      expect.objectContaining({
        type: "message.completed",
        itemId: "agent-1",
        text: "Final answer before hook failure.",
      }),
    ]);
  });

  test("routes concurrent prompt message events by thread before every turn id is known", async () => {
    const client = new ManualConcurrentCodexClient();
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
    });
    const eventsA: BridgeEvent[] = [];
    const eventsB: BridgeEvent[] = [];

    const sendA = plane.sendPrompt(
      { ...promptParams, threadId: "thread-a", message: "Answer in chat A." },
      (event) => eventsA.push(event),
    );
    await client.waitForTurnStart("thread-a");
    client.resolveTurnStart("thread-a", "turn-a");
    await flushAsyncWork();

    const sendB = plane.sendPrompt(
      { ...promptParams, threadId: "thread-b", message: "Answer in chat B." },
      (event) => eventsB.push(event),
    );
    await client.waitForTurnStart("thread-b");

    client.emit({
      method: "item/completed",
      params: {
        threadId: "thread-a",
        turnId: "turn-a",
        item: {
          id: "agent-a",
          type: "agentMessage",
          text: "A response.",
        },
      },
    });
    client.emit({
      method: "turn/completed",
      params: {
        threadId: "thread-a",
        turn: { id: "turn-a", items: [] },
      },
    });
    await sendA;

    expect(eventsA.filter((event) => event.type === "message.completed")).toEqual([
      expect.objectContaining({
        type: "message.completed",
        itemId: "agent-a",
        text: "A response.",
        threadId: "thread-a",
        turnId: "turn-a",
      }),
    ]);
    expect(eventsB.filter((event) => event.type === "message.completed")).toEqual([]);

    client.resolveTurnStart("thread-b", "turn-b");
    await flushAsyncWork();
    client.emit({
      method: "item/completed",
      params: {
        threadId: "thread-b",
        turnId: "turn-b",
        item: {
          id: "agent-b",
          type: "agentMessage",
          text: "B response.",
        },
      },
    });
    client.emit({
      method: "turn/completed",
      params: {
        threadId: "thread-b",
        turn: { id: "turn-b", items: [] },
      },
    });
    await sendB;

    expect(eventsB.filter((event) => event.type === "message.completed")).toEqual([
      expect.objectContaining({
        type: "message.completed",
        itemId: "agent-b",
        text: "B response.",
        threadId: "thread-b",
        turnId: "turn-b",
      }),
    ]);
  });

  test("passes app-server model controls using current field names", async () => {
    const client = new FakeCodexClient();
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
    });

    await plane.sendPrompt(
      {
        ...promptParams,
        model: "gpt-5.4",
        reasoningEffort: "medium",
        serviceTier: "fast",
      },
      () => undefined,
    );

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    expect(turnStart?.params).toMatchObject({
      model: "gpt-5.4",
      effort: "medium",
      serviceTier: "fast",
    });
    expect(turnStart?.params?.reasoningEffort).toBeUndefined();
  });

  test("starts and waits for native app-server thread compaction", async () => {
    const client = new FakeCodexClient();
    const events: BridgeEvent[] = [];
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
      emitEvent: (event) => events.push(event),
    });

    const result = await plane.compactThread({
      threadId: "thread-1",
      waitForCompletion: true,
    });

    expect(client.calls.find((call) => call.method === "thread/compact/start")?.params).toEqual({
      threadId: "thread-1",
    });
    expect(result).toEqual({
      threadId: "thread-1",
      status: "completed",
      turnId: "turn-compact",
    });
    expect(events).toContainEqual({
      type: "context.compaction.started",
      threadId: "thread-1",
      turnId: "turn-compact",
      itemId: "compact-item-1",
    });
    expect(events).toContainEqual({
      type: "context.compaction.completed",
      threadId: "thread-1",
      turnId: "turn-compact",
      itemId: "compact-item-1",
    });
  });

  test("passes external skill roots to app-server skill discovery", async () => {
    const client = new FakeCodexClient();
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: {
        ...harness,
        getWorkspaceRoot: async () => "/tmp/project",
      } as never,
      secrets: new InMemoryBridgeSecrets(),
    });

    await plane.listSkills({ extraUserRoots: ["/tmp/external-skills"] });

    expect(client.calls.find((call) => call.method === "skills/list")?.params).toMatchObject({
      cwds: ["/tmp/project"],
      perCwdExtraUserRoots: [
        {
          cwd: "/tmp/project",
          extraUserRoots: ["/tmp/external-skills"],
        },
      ],
    });
  });

  test("recovers generated image previews from thread history when item notification is missing", async () => {
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      threadReadItems: [
        {
          id: "image-from-thread",
          type: "imageGeneration",
          result: "data:image/png;base64,abc123",
        },
      ],
    });
    const imageAssets = new BridgeImageAssetStore();
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
      imageAssets,
    });
    const events: BridgeEvent[] = [];

    await plane.sendPrompt(promptParams, (event) => events.push(event));

    const imageEvent = events.find((event) => event.type === "message.image");
    expect(imageEvent).toMatchObject({
      type: "message.image",
      itemId: "image-from-thread",
      alt: "Generated image",
    });
    expect(imageEvent?.type === "message.image" && isBridgeImageAssetRef(imageEvent.previewRef)).toBe(true);
  });

  test("recovers final assistant text from thread history when item completion is missing", async () => {
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      threadReadItems: [
        {
          id: "agent-from-thread",
          type: "agentMessage",
          text: "Recovered final answer.",
        },
      ],
    });
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
    });
    const events: BridgeEvent[] = [];

    await plane.sendPrompt(promptParams, (event) => events.push(event));

    expect(events).toContainEqual(expect.objectContaining({
      type: "message.completed",
      itemId: "agent-from-thread",
      text: "Recovered final answer.",
    }));
  });

  test("recovers final assistant text when item completion has no text payload", async () => {
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      emitEmptyAgentCompletion: true,
      threadReadItems: [
        {
          id: "agent-from-thread",
          type: "agentMessage",
          text: "Recovered from empty completion.",
        },
      ],
    });
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
    });
    const events: BridgeEvent[] = [];

    await plane.sendPrompt(promptParams, (event) => events.push(event));

    expect(events.filter((event) => event.type === "message.completed")).toEqual([
      expect.objectContaining({
        type: "message.completed",
        itemId: "agent-from-thread",
        text: "Recovered from empty completion.",
      }),
    ]);
  });

  test("emits image previews when Codex only reports a generated local image path in assistant text", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-plane-text-image-"));
    const imagePath = join(tempDir, "generated preview.png");
    await writeFile(imagePath, Buffer.from("fake-image"));
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      agentText: `Saved the edited image here: ${imagePath}`,
    });
    const imageAssets = new BridgeImageAssetStore();
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
      imageAssets,
    });
    const events: BridgeEvent[] = [];

    await plane.sendPrompt(promptParams, (event) => events.push(event));

    const imageEvent = events.find((event) => event.type === "message.image");
    expect(imageEvent).toMatchObject({
      type: "message.image",
      itemId: "agent-1",
      alt: "Generated image",
    });
    expect(imageEvent?.type === "message.image" && isBridgeImageAssetRef(imageEvent.previewRef)).toBe(true);
  });

  test("normalizes Windows file URL image paths without POSIX-leading slashes", () => {
    expect(normalizeLocalImagePath("file:///C:/Users/Alice/AppData/Local/Temp/generated%20image.png")).toBe(
      "C:\\Users\\Alice\\AppData\\Local\\Temp\\generated image.png",
    );
    expect(normalizeLocalImagePath("file://server/share/generated%20image.png")).toBe(
      "\\\\server\\share\\generated image.png",
    );
  });

  test("retries transient prompt failures and emits reconnect attempts before succeeding", async () => {
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      agentText: "Recovered after reconnect.",
      turnStartFailures: ["codex app-server exited with code unknown", "HTTP error: 503"],
    });
    const events: BridgeEvent[] = [];
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
      retryDelayImpl: async () => undefined,
    });

    await plane.sendPrompt({ ...promptParams, clientRequestId: "prompt-retry-1" }, (event) => events.push(event));

    expect(client.calls.filter((call) => call.method === "turn/start")).toHaveLength(3);
    expect(events.filter((event) => event.type === "prompt.retrying")).toEqual([
      {
        type: "prompt.retrying",
        clientRequestId: "prompt-retry-1",
        attempt: 1,
        maxAttempts: 5,
        reason: "codex app-server exited with code unknown",
      },
      {
        type: "prompt.retrying",
        clientRequestId: "prompt-retry-1",
        attempt: 2,
        maxAttempts: 5,
        reason: "HTTP error: 503",
      },
    ]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "message.completed",
      itemId: "agent-1",
      text: "Recovered after reconnect.",
    }));
  });

  test("starts a replacement thread when the saved Codex thread is missing", async () => {
    const staleThreadId = "019dc610-b810-73a1-ae21-7c9efa2d88ca";
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      agentText: "Recovered on a fresh thread.",
      turnStartFailures: [`thread not found: ${staleThreadId}`],
    });
    const events: BridgeEvent[] = [];
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
      retryDelayImpl: async () => undefined,
    });

    const result = await plane.sendPrompt(
      {
        ...promptParams,
        clientRequestId: "prompt-missing-thread",
        threadId: staleThreadId,
      },
      (event) => events.push(event),
    );

    const turnStarts = client.calls.filter((call) => call.method === "turn/start");
    expect(turnStarts.map((call) => call.params?.threadId)).toEqual([staleThreadId, "thread-1"]);
    expect(client.calls.filter((call) => call.method === "thread/start")).toHaveLength(1);
    expect(events).toContainEqual({
      type: "prompt.retrying",
      clientRequestId: "prompt-missing-thread",
      attempt: 1,
      maxAttempts: 5,
      reason: `thread not found: ${staleThreadId}`,
    });
    expect(result.threadId).toBe("thread-1");
    expect(events).toContainEqual(expect.objectContaining({
      type: "message.completed",
      itemId: "agent-1",
      text: "Recovered on a fresh thread.",
    }));
  });

  test("does not send reasoning summary to gpt-5.3-codex-spark", async () => {
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      agentText: "Spark response.",
    });
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
    });

    await plane.sendPrompt({ ...promptParams, model: "gpt-5.3-codex-spark" }, () => undefined);

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    expect(turnStart?.params).toMatchObject({
      model: "gpt-5.3-codex-spark",
      personality: "pragmatic",
    });
    expect(turnStart?.params).not.toHaveProperty("summary");
  });

  test("retries turn start without reasoning summary when a model rejects reasoning.summary", async () => {
    const unsupportedSummaryError = JSON.stringify({
      type: "error",
      error: {
        type: "invalid_request_error",
        code: "unsupported_parameter",
        message: "Unsupported parameter: 'reasoning.summary' is not supported with the 'gpt-next' model.",
        param: "reasoning.summary",
      },
      status: 400,
    });
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      agentText: "Retried without summary.",
      turnStartFailures: [unsupportedSummaryError],
    });
    const events: BridgeEvent[] = [];
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
      retryDelayImpl: async () => undefined,
    });

    await plane.sendPrompt({ ...promptParams, model: "gpt-next" }, (event) => events.push(event));

    const turnStarts = client.calls.filter((call) => call.method === "turn/start");
    expect(turnStarts).toHaveLength(2);
    expect(turnStarts[0]?.params).toMatchObject({ model: "gpt-next", summary: "concise" });
    expect(turnStarts[1]?.params).toMatchObject({ model: "gpt-next" });
    expect(turnStarts[1]?.params).not.toHaveProperty("summary");
    expect(events.filter((event) => event.type === "prompt.retrying")).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "message.completed",
      itemId: "agent-1",
      text: "Retried without summary.",
    }));
  });

  test("stops retrying prompt failures after five reconnect attempts", async () => {
    const client = new FakeCodexClient({
      emitImageBeforeTurnCompleted: false,
      turnStartFailures: Array.from({ length: 6 }, () => "Native host disconnected"),
    });
    const events: BridgeEvent[] = [];
    const plane = new AppServerCodexPlane({
      client: client as never,
      harness: harness as never,
      secrets: new InMemoryBridgeSecrets(),
      retryDelayImpl: async () => undefined,
    });

    await expect(
      plane.sendPrompt({ ...promptParams, clientRequestId: "prompt-retry-exhausted" }, (event) => events.push(event)),
    ).rejects.toThrow("Native host disconnected");

    expect(client.calls.filter((call) => call.method === "turn/start")).toHaveLength(6);
    expect(events.filter((event) => event.type === "prompt.retrying").map((event) => event.type === "prompt.retrying" ? event.attempt : 0)).toEqual([
      1,
      2,
      3,
      4,
      5,
    ]);
  });
});

describe("CodexImagePlane", () => {
  test("persists current page image inputs into the workspace image folder before passing them to Codex", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-image-edit-workspace-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const client = new FakeCodexClient({ imageEditMode: true });
    const plane = new CodexImagePlane(
      {
        runHooks: async () => ({ appendPrompt: [] }),
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    await plane.startEdit({
      prompt: "현재 페이지 이미지의 텍스트를 한국어로 번역해줘.",
      image: {
        base64: Buffer.from("source image").toString("base64"),
        mimeType: "image/png",
        filename: "current-page.png",
      },
    });

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    const inputItems = Array.isArray(turnStart?.params?.input) ? turnStart.params.input : [];
    const localImage = inputItems.find(
      (item): item is { type: "localImage"; path: string } =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "localImage" &&
        typeof (item as { path?: unknown }).path === "string",
    );

    expect(localImage?.path).toContain(join(workspaceRoot, ".codex-sidepanel", "generated-images", "input-"));
    await expect(stat(localImage?.path ?? "")).resolves.toMatchObject({ isFile: expect.any(Function) });
  });

  test("instructs Codex to edit the visible page image target without changing surrounding browser UI", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-image-edit-workspace-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const client = new FakeCodexClient({ imageEditMode: true });
    const plane = new CodexImagePlane(
      {
        runHooks: async () => ({ appendPrompt: [] }),
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    await plane.startEdit({
      prompt: "도넛을 피자로 변경해줘.",
      image: {
        base64: Buffer.from("source image").toString("base64"),
        mimeType: "image/jpeg",
        filename: "visible-page-image.jpg",
      },
    });

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    const inputItems = Array.isArray(turnStart?.params?.input) ? turnStart.params.input : [];
    const textItem = inputItems.find(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    );

    expect(textItem?.text).toContain("Target: edit the first attached image");
    expect(textItem?.text).toContain("It may be an uploaded image");
    expect(textItem?.text).toContain("If the first attached image is a browser/page capture");
    expect(textItem?.text).toContain("do not edit browser chrome, side-panel UI, captions, reactions, or surrounding page controls");
    expect(textItem?.text).toContain("For object replacement requests");
  });

  test("generates infographic images from page context without requiring local image inputs", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-image-generate-workspace-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const client = new FakeCodexClient({ imageEditMode: true });
    const plane = new CodexImagePlane(
      {
        runHooks: async () => ({ appendPrompt: [] }),
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    await plane.startGenerate({
      prompt: "Create an infographic from the current page.",
      contexts: [
        {
          metadata: {
            url: "https://example.com/report",
            title: "Market Report",
            domain: "example.com",
          },
          selectionText: "",
          domSummary: "Revenue grew 23% while churn dropped 4%.",
          visionAssets: [],
          adapterPayload: null,
          privacyFlags: {
            containsSensitiveFormData: false,
            userConsentedToHistory: false,
          },
        },
      ],
      workflow: "infographic",
      model: "gpt-image-2",
    });

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    const inputItems = Array.isArray(turnStart?.params?.input) ? turnStart.params.input : [];
    const textItem = inputItems.find(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    );
    const localImageItems = inputItems.filter(
      (item) => typeof item === "object" && item !== null && (item as { type?: unknown }).type === "localImage",
    );

    expect(textItem?.text).toContain("Generate a new visual explainer image");
    expect(textItem?.text).toContain("gpt-image-2");
    expect(textItem?.text).toContain("Use case: current-page-visual-explainer");
    expect(textItem?.text).not.toContain("Render target:");
    expect(textItem?.text).not.toContain("legible on mobile");
    expect(textItem?.text).not.toContain("vertical");
    expect(textItem?.text).not.toContain("portrait");
    expect(textItem?.text).not.toContain("aspect ratio");
    expect(textItem?.text).not.toContain("1024x1536");
    expect(textItem?.text).toContain("PRIVATE PAGE CONTEXT");
    expect(textItem?.text).toContain("Do not invent metrics");
    expect(textItem?.text).toContain("use reference chaining");
    expect(textItem?.text).toContain("Input images or Reference images");
    expect(textItem?.text).toContain("Previous image prompt summary");
    expect(localImageItems).toEqual([]);
  });

  test("uses the same app-server image generation path for API-key accounts", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-image-generate-apikey-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const client = new FakeCodexClient({
      imageEditMode: true,
      accountReadResult: {
        account: { type: "apiKey" },
      },
    });
    const plane = new CodexImagePlane(
      {
        runHooks: async () => ({ appendPrompt: [] }),
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    const result = await plane.startGenerate({
      prompt: "Generate a product concept image.",
      contexts: [],
      model: "gpt-image-2",
    });

    expect(result.previewRef).toMatch(/^codex-asset:/);
    expect(client.calls.find((call) => call.method === "account/read")?.params).toMatchObject({
      refreshToken: false,
    });
    expect(client.calls.find((call) => call.method === "turn/start")).toBeTruthy();
  });

  test("ignores explicit image render parameters for ChatGPT OAuth accounts", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-image-generate-chatgpt-params-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const hookPayloads: Array<Record<string, unknown>> = [];
    const client = new FakeCodexClient({
      imageEditMode: true,
      accountReadResult: {
        account: { type: "chatgpt" },
      },
    });
    const plane = new CodexImagePlane(
      {
        runHooks: async (_event: string, _scope: string, payload?: Record<string, unknown>) => {
          if (payload) {
            hookPayloads.push(payload);
          }
          return { appendPrompt: [] };
        },
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    await plane.startGenerate({
      prompt: "Generate a product concept image.",
      contexts: [],
      model: "gpt-image-2",
      quality: "high",
      size: "1024x1024",
    });

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    const inputItems = Array.isArray(turnStart?.params?.input) ? turnStart.params.input : [];
    const textItem = inputItems.find(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    );

    expect(textItem?.text).not.toContain("Render target:");
    expect(hookPayloads.find((payload) => payload.mode === "generate")).toMatchObject({
      quality: null,
      size: null,
    });
  });

  test("preserves explicit image render parameters only for API-key accounts", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-image-generate-apikey-params-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const hookPayloads: Array<Record<string, unknown>> = [];
    const client = new FakeCodexClient({
      imageEditMode: true,
      accountReadResult: {
        account: { type: "apiKey" },
      },
    });
    const plane = new CodexImagePlane(
      {
        runHooks: async (_event: string, _scope: string, payload?: Record<string, unknown>) => {
          if (payload) {
            hookPayloads.push(payload);
          }
          return { appendPrompt: [] };
        },
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    await plane.startGenerate({
      prompt: "Generate a product concept image.",
      contexts: [],
      model: "gpt-image-2",
      quality: "high",
      size: "1024x1024",
    });

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    const inputItems = Array.isArray(turnStart?.params?.input) ? turnStart.params.input : [];
    const textItem = inputItems.find(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    );

    expect(textItem?.text).toContain("Render target: 1024x1024, high quality.");
    expect(hookPayloads.find((payload) => payload.mode === "generate")).toMatchObject({
      quality: "high",
      size: "1024x1024",
    });
  });

  test("fails image generation early with a clear message for free ChatGPT accounts", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-image-generate-free-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const client = new FakeCodexClient({
      accountReadResult: {
        account: { type: "chatgpt", planType: "free" },
      },
    });
    const plane = new CodexImagePlane(
      {
        runHooks: async () => ({ appendPrompt: [] }),
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    await expect(
      plane.startGenerate({
        prompt: "Generate a product concept image.",
        contexts: [],
        model: "gpt-image-2",
      }),
    ).rejects.toThrow("Image generation is not available on free ChatGPT accounts");
    expect(client.calls.find((call) => call.method === "turn/start")).toBeUndefined();
  });

  test("does not block image generation from non-ChatGPT accounts with unrelated plan fields", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-image-generate-apikey-plan-field-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const client = new FakeCodexClient({
      imageEditMode: true,
      accountReadResult: {
        account: { type: "apiKey" },
        planType: "free",
      },
    });
    const plane = new CodexImagePlane(
      {
        runHooks: async () => ({ appendPrompt: [] }),
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    const result = await plane.startGenerate({
      prompt: "Generate a product concept image.",
      contexts: [],
      model: "gpt-image-2",
    });

    expect(result.previewRef).toMatch(/^codex-asset:/);
    expect(client.calls.find((call) => call.method === "turn/start")).toBeTruthy();
  });

  test("preserves app-server image generation failures without inferring the account plan from text", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-image-generate-app-error-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const appServerMessage = "Image_gen tool is not available for free accounts.";
    const client = new FakeCodexClient({
      turnStartFailures: [appServerMessage],
    });
    const plane = new CodexImagePlane(
      {
        runHooks: async () => ({ appendPrompt: [] }),
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    let thrownMessage = "";
    try {
      await plane.startGenerate({
        prompt: "Generate a product concept image.",
        contexts: [],
        model: "gpt-image-2",
      });
    } catch (error) {
      thrownMessage = error instanceof Error ? error.message : String(error);
    }

    expect(thrownMessage).toBe(appServerMessage);
    expect(thrownMessage).not.toContain("Image generation is not available on free ChatGPT accounts");
  });

  test("materializes visible-screen context for infographic generation", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-image-generate-screenshot-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const client = new FakeCodexClient({ imageEditMode: true });
    const plane = new CodexImagePlane(
      {
        runHooks: async () => ({ appendPrompt: [] }),
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    await plane.startGenerate({
      prompt: "Create an infographic from this visible dashboard.",
      contexts: [
        {
          metadata: {
            url: "https://example.com/dashboard",
            title: "Visual dashboard",
            domain: "example.com",
          },
          selectionText: "",
          domSummary: "",
          visionAssets: [
            {
              ref: `data:image/png;base64,${Buffer.from("visible screenshot").toString("base64")}`,
              kind: "screenshot",
            },
          ],
          adapterPayload: null,
          privacyFlags: {
            containsSensitiveFormData: false,
            userConsentedToHistory: false,
          },
        },
      ],
      workflow: "infographic",
      model: "gpt-image-2",
    });

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    const inputItems = Array.isArray(turnStart?.params?.input) ? turnStart.params.input : [];
    const localImageItems = inputItems.filter(
      (item): item is { type: "localImage"; path: string } =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "localImage" &&
        typeof (item as { path?: unknown }).path === "string",
    );

    expect(localImageItems).toHaveLength(1);
    expect(localImageItems[0]?.path).toContain("context-1-asset-1.png");
  });

  test("generates a normal image from a user-provided prompt without rewriting it as prompt advice", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-image-generate-prompt-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const client = new FakeCodexClient({ imageEditMode: true });
    const plane = new CodexImagePlane(
      {
        runHooks: async () => ({ appendPrompt: [] }),
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    await plane.startGenerate({
      prompt: "프롬프트: blue cloud-shaped coding app icon, glossy 3D. 이 프롬프트로 이미지 생성해줘.",
      workflow: "generated-image",
      model: "gpt-image-2",
    });

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    const inputItems = Array.isArray(turnStart?.params?.input) ? turnStart.params.input : [];
    const textItem = inputItems.find(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    );

    expect(textItem?.text).toContain("Generate a new image from the user's request");
    expect(textItem?.text).toContain("Use case: general-image-generation");
    expect(textItem?.text).not.toContain("Render target:");
    expect(textItem?.text).toContain("execute that prompt as the visual brief");
    expect(textItem?.text).toContain("Reference image unavailable");
    expect(textItem?.text).toContain("repeated design contract");
    expect(textItem?.text).toContain("이 프롬프트로 이미지 생성해줘");
  });

  test("passes recent conversation context and attached document text into infographic generation", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-image-generate-context-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const client = new FakeCodexClient({ imageEditMode: true });
    const plane = new CodexImagePlane(
      {
        runHooks: async () => ({ appendPrompt: [] }),
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    await plane.startGenerate({
      prompt: "Create a paper infographic.",
      conversationContext: "User previously asked for a non-technical investor-facing visual.",
      fileAttachments: [
        {
          id: "paper-notes",
          name: "paper-notes.txt",
          mimeType: "text/plain",
          sizeBytes: 34,
          lastModified: 1,
          base64: Buffer.from("Transformer paper notes and limits.").toString("base64"),
          kind: "text",
        },
      ],
      contexts: [
        {
          metadata: {
            url: "https://arxiv.org/abs/1706.03762",
            title: "Attention Is All You Need",
            domain: "arxiv.org",
          },
          selectionText: "",
          domSummary: "Current arXiv paper metadata.",
          visionAssets: [],
          adapterPayload: { platform: "arxiv", arxivId: "1706.03762" },
          privacyFlags: {
            containsSensitiveFormData: false,
            userConsentedToHistory: false,
          },
        },
      ],
      model: "gpt-image-2",
    });

    const turnStart = client.calls.find((call) => call.method === "turn/start");
    const inputItems = Array.isArray(turnStart?.params?.input) ? turnStart.params.input : [];
    const textItem = inputItems.find(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    );

    expect(textItem?.text).toContain("PREVIOUS CONVERSATION CONTEXT");
    expect(textItem?.text).toContain("investor-facing visual");
    expect(textItem?.text).toContain("ATTACHED FILE 1");
    expect(textItem?.text).toContain("Transformer paper notes and limits");
  });

  test("returns all sequential image generations produced in one Codex turn", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-slide-generate-context-"));
    const imageAssets = new BridgeImageAssetStore({
      outputDir: () => join(workspaceRoot, ".codex-sidepanel", "generated-images"),
    });
    const client = new FakeCodexClient({
      imageEditMode: true,
      imageGenerationItems: [
        {
          id: "slide-1",
          type: "imageGeneration",
          result: "data:image/png;base64,abc123",
        },
        {
          id: "slide-2",
          type: "imageGeneration",
          result: "data:image/png;base64,def456",
        },
      ],
    });
    const plane = new CodexImagePlane(
      {
        runHooks: async () => ({ appendPrompt: [] }),
        resolvePromptInstructions: async () => ({ text: "", sources: [] }),
        getWorkspaceRoot: async () => workspaceRoot,
      } as never,
      { client: client as never, imageAssets },
    );

    const events: BridgeEvent[] = [];
    const result = await plane.startGenerate(
      {
        prompt: "Create a 2-slide deck. Generate slide 1 first, then slide 2 in this same turn.",
        contexts: [],
        clientRequestId: "slide-req-1",
        workflow: "slide-images",
        model: "gpt-image-2",
      },
      (event) => events.push(event),
    );

    expect(result.previewRef).toBe(result.previewRefs[0]);
    expect(result.previewRefs).toHaveLength(2);
    expect(result.previewRefs.every((previewRef) => isBridgeImageAssetRef(previewRef))).toBe(true);
    expect(events.filter((event) => event.type === "message.image")).toEqual([
      expect.objectContaining({
        type: "message.image",
        itemId: "slide-req-1-image-1",
        clientRequestId: "slide-req-1",
        workflow: "slide-images",
        imageIndex: 1,
      }),
      expect.objectContaining({
        type: "message.image",
        itemId: "slide-req-1-image-2",
        clientRequestId: "slide-req-1",
        workflow: "slide-images",
        imageIndex: 2,
      }),
    ]);
  });
});
