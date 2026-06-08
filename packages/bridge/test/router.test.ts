import { describe, expect, test, vi } from "vitest";

import {
  BridgeRpcRouter,
  createCodexTurnInput,
  createCodexTurnInputItems,
  type BridgeDependencies,
  type BridgeEvent,
} from "../src/index.js";
import type { PageContextEnvelope, ProfileTemplate } from "@codex-sidepanel/shared";

const profile: ProfileTemplate = {
  id: "research-assistant",
  name: "Research Assistant",
  systemPrompt: "Answer precisely.",
  defaultContextPolicy: {
    attachCurrentPageByDefault: true,
    allowedReadStrategies: ["dom", "hybrid"],
  },
  allowedSources: ["current-page", "open-tabs"],
  preferredActions: ["summarize-page"],
  adapterHints: [],
};

const context: PageContextEnvelope = {
  metadata: {
    url: "https://example.com/article",
    title: "Example Article",
    domain: "example.com",
  },
  selectionText: "Selected paragraph",
  domSummary: "A compact article summary.",
  visionAssets: [{ ref: "capture://tab", kind: "screenshot" }],
  adapterPayload: null,
  privacyFlags: {
    containsSensitiveFormData: false,
    userConsentedToHistory: false,
  },
};

describe("createCodexTurnInput", () => {
  test("formats profile prompt and normalized page context for app-server", () => {
    const result = createCodexTurnInput({
      profile,
      message: "Summarize this for me.",
      contexts: [context],
    });

    expect(result).toContain("PRIVATE INSTRUCTION PROFILE");
    expect(result).toContain("Answer precisely.");
    expect(result).toContain("PRIVATE PAGE CONTEXT 1");
    expect(result).toContain("Example Article");
    expect(result).toContain("Selected paragraph");
    expect(result).toContain("Summarize this for me.");
  });

  test("prefixes app and skill invocation tokens when structured inputs are attached", async () => {
    const items = await createCodexTurnInputItems(
      {
        profile,
        message: "Summarize the updates.",
        contexts: [context],
        structuredInputs: [
          {
            id: "skill-1",
            type: "skill",
            name: "skill-creator",
            path: "/tmp/skill-creator/SKILL.md",
            token: "$skill-creator",
          },
          {
            id: "app-1",
            type: "mention",
            name: "Demo App",
            path: "app://demo-app",
            token: "$demo-app",
          },
        ],
      },
      async () => "/tmp/context.png",
    );

    expect(items[0]).toMatchObject({
      type: "text",
      text_elements: [],
    });
    expect((items[0] as { text: string }).text).toContain("$skill-creator $demo-app Summarize the updates.");
    expect(items[1]).toEqual({
      type: "skill",
      name: "skill-creator",
      path: "/tmp/skill-creator/SKILL.md",
    });
    expect(items[2]).toEqual({
      type: "mention",
      name: "Demo App",
      path: "app://demo-app",
    });
  });
});

describe("BridgeRpcRouter", () => {
  test("returns account status from the auth-aware planes", async () => {
    const router = new BridgeRpcRouter(createDependencies());

    const result = await router.handle({
      id: "1",
      method: "account.status",
      params: {},
    });

    expect(result.result).toEqual({
      authMode: "chatgpt",
      codexAuthenticated: true,
      multimodalAvailable: false,
      openAiApiKeyConfigured: false,
    });
  });

  test("streams prompt events through the notification sink", async () => {
    const emitted: BridgeEvent[] = [];
    const sendPrompt = vi.fn(async (_payload: unknown, emit: (event: BridgeEvent) => void) => {
      emit({ type: "message.delta", itemId: "item-1", delta: "Hello" });
      emit({ type: "message.completed", itemId: "item-1", text: "Hello world" });
      return { threadId: "thread-1", turnId: "turn-1" };
    });

    const router = new BridgeRpcRouter(
      createDependencies({
        codex: {
          accountStatus: async () => ({
            authMode: "chatgpt",
            codexAuthenticated: true,
            multimodalAvailable: false,
            openAiApiKeyConfigured: false,
          }),
          login: vi.fn(),
          logout: vi.fn(),
          openSession: vi.fn(),
          resumeSession: vi.fn(),
          sendPrompt,
        },
      }),
    );

    const result = await router.handle(
      {
        id: "2",
        method: "prompt.send",
        params: {
          profile,
          message: "hello",
          contexts: [context],
        },
      },
      { emit: (event) => emitted.push(event) },
    );

    expect(sendPrompt).toHaveBeenCalledOnce();
    expect(result.result).toEqual({ threadId: "thread-1", turnId: "turn-1" });
    expect(emitted).toEqual([
      { type: "message.delta", itemId: "item-1", delta: "Hello" },
      { type: "message.completed", itemId: "item-1", text: "Hello world" },
    ]);
  });

  test("stores realtime translation API keys without using Codex account login", async () => {
    const saveApiKey = vi.fn(async () => ({ stored: true }));
    const login = vi.fn();
    const router = new BridgeRpcRouter(
      createDependencies({
        codex: {
          login,
        },
        translation: {
          saveApiKey,
          createClientSecret: async () => ({
            value: "ek_test",
            expiresAt: 1_700_000_600,
            sessionId: "sess_test",
            model: "gpt-realtime-translate",
            targetLanguage: "ko",
          }),
        },
      }),
    );

    const result = await router.handle({
      id: "translation-key",
      method: "translation.api_key.save",
      params: { apiKey: "sk-test" },
    });

    expect(result.result).toEqual({ stored: true });
    expect(saveApiKey).toHaveBeenCalledWith({ apiKey: "sk-test" });
    expect(login).not.toHaveBeenCalled();
  });

  test("clears realtime translation API keys without logging out Codex", async () => {
    const clearApiKey = vi.fn(async () => ({ cleared: true }));
    const logout = vi.fn();
    const router = new BridgeRpcRouter(
      createDependencies({
        codex: {
          logout,
        },
        translation: {
          clearApiKey,
        },
      }),
    );

    const result = await router.handle({
      id: "translation-key-clear",
      method: "translation.api_key.clear",
      params: {},
    });

    expect(result.result).toEqual({ cleared: true });
    expect(clearApiKey).toHaveBeenCalledWith();
    expect(logout).not.toHaveBeenCalled();
  });

  test("starts thread compaction through the Codex plane", async () => {
    const compactThread = vi.fn(async () => ({
      threadId: "thread-1",
      status: "completed" as const,
      turnId: "turn-compact",
    }));
    const router = new BridgeRpcRouter(
      createDependencies({
        codex: {
          compactThread,
        },
      }),
    );

    const result = await router.handle({
      id: "compact-1",
      method: "thread.compact.start",
      params: {
        threadId: "thread-1",
        waitForCompletion: true,
      },
    });

    expect(compactThread).toHaveBeenCalledWith({
      threadId: "thread-1",
      waitForCompletion: true,
    });
    expect(result.result).toEqual({
      threadId: "thread-1",
      status: "completed",
      turnId: "turn-compact",
    });
  });

  test("returns generated image folder metadata for settings UI", async () => {
    const router = new BridgeRpcRouter(createDependencies());

    const result = await router.handle({
      id: "image-folder",
      method: "image.asset.folder",
      params: {},
    });

    expect(result.result).toEqual({
      rootDir: "/tmp/codex-images",
      latestFolder: "/tmp/codex-images",
      folders: ["/tmp/codex-images"],
      assetCount: 1,
      latestAssetPath: "/tmp/codex-images/generated.png",
    });
  });

  test("opens the generated image folder through the bridge only", async () => {
    const router = new BridgeRpcRouter(createDependencies());

    const result = await router.handle({
      id: "image-folder-open",
      method: "image.asset.folder.open",
      params: {},
    });

    expect(result.result).toEqual({
      opened: true,
      folder: "/tmp/codex-images",
    });
  });

  test("reveals local files through the bridge local file plane", async () => {
    const router = new BridgeRpcRouter(createDependencies());

    const result = await router.handle({
      id: "local-file-reveal",
      method: "local.file.reveal",
      params: { path: "/tmp/codex-images/generated.pdf" },
    });

    expect(result.result).toEqual({
      opened: true,
      path: "/tmp/codex-images/generated.pdf",
      folder: "/tmp/codex-images",
    });
  });

  test("deletes a generated image asset through the image plane", async () => {
    const router = new BridgeRpcRouter(createDependencies());

    const result = await router.handle({
      id: "image-delete",
      method: "image.asset.delete",
      params: { previewRef: "preview://1" },
    });

    expect(result.result).toEqual({
      deleted: true,
      previewRef: "preview://1",
      path: "/tmp/codex-images/generated.png",
    });
  });

  test("starts current-page infographic generation through the image plane", async () => {
    const startGenerate = vi.fn(async () => ({
      jobId: "image-generate-1",
      previewRef: "bridge-image://generated/1",
      previewRefs: ["bridge-image://generated/1"],
    }));
    const router = new BridgeRpcRouter(
      createDependencies({
        image: {
          startGenerate,
        },
      }),
    );

    const result = await router.handle({
      id: "image-generate",
      method: "image.generate.start",
      params: {
        prompt: "Create an infographic.",
        contexts: [context],
        fileAttachments: [],
        conversationContext: "Previous chat requested executive visuals.",
        model: "gpt-image-2",
      },
    });

    expect(startGenerate).toHaveBeenCalledWith(
      {
        prompt: "Create an infographic.",
        contexts: [context],
        fileAttachments: [],
        conversationContext: "Previous chat requested executive visuals.",
        model: "gpt-image-2",
      },
      expect.any(Function),
    );
    expect(result.result).toEqual({
      jobId: "image-generate-1",
      previewRef: "bridge-image://generated/1",
      previewRefs: ["bridge-image://generated/1"],
    });
  });

  test("streams image generation events through the notification sink", async () => {
    const emitted: BridgeEvent[] = [];
    const startGenerate = vi.fn(async (_params: unknown, emit?: (event: BridgeEvent) => void) => {
      emit?.({
        type: "message.image",
        itemId: "slides-1-image-1",
        previewRef: "bridge-image://generated/slide-1",
        alt: "Presentation slide image 1",
        clientRequestId: "slides-1",
        workflow: "slide-images",
        imageIndex: 1,
      });
      return {
        jobId: "image-generate-1",
        previewRef: "bridge-image://generated/slide-1",
        previewRefs: ["bridge-image://generated/slide-1"],
      };
    });
    const router = new BridgeRpcRouter(
      createDependencies({
        image: {
          startGenerate,
        },
      }),
    );
    router.setNotificationSink((event) => emitted.push(event));

    await router.handle({
      id: "image-generate-streaming",
      method: "image.generate.start",
      params: {
        prompt: "Create slide images.",
        clientRequestId: "slides-1",
        workflow: "slide-images",
      },
    });

    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "message.image",
        clientRequestId: "slides-1",
        workflow: "slide-images",
        imageIndex: 1,
      }),
    );
  });

  test("returns diagnostic log folder metadata for settings UI", async () => {
    const router = new BridgeRpcRouter(createDependencies(), {
      diagnostics: {
        record: async () => undefined,
        describeLogFolder: async () => ({
          rootDir: "/tmp/codex-logs",
          latestLogPath: "/tmp/codex-logs/bridge.log",
          files: ["/tmp/codex-logs/bridge.log"],
        }),
        openLogFolder: async () => ({ opened: true, folder: "/tmp/codex-logs" }),
      },
    });

    const result = await router.handle({
      id: "diagnostics-folder",
      method: "diagnostics.log.folder",
      params: {},
    });

    expect(result.result).toEqual({
      rootDir: "/tmp/codex-logs",
      latestLogPath: "/tmp/codex-logs/bridge.log",
      files: ["/tmp/codex-logs/bridge.log"],
    });
  });

  test("routes app-server catalog and control methods", async () => {
    const router = new BridgeRpcRouter(createDependencies());

    const [models, threads, rateLimits, skills, apps, plugins, mcpServers, turns, steer, interrupt] = await Promise.all([
      router.handle({ id: "m", method: "model.list", params: {} }),
      router.handle({ id: "t", method: "thread.list", params: { cwd: "/tmp/project" } }),
      router.handle({ id: "r", method: "account.rate_limits.read", params: {} }),
      router.handle({ id: "s", method: "skills.list", params: { cwd: "/tmp/project" } }),
      router.handle({ id: "a", method: "apps.list", params: {} }),
      router.handle({ id: "p", method: "plugins.list", params: { cwd: "/tmp/project" } }),
      router.handle({ id: "mcp", method: "mcp.servers.list", params: {} }),
      router.handle({ id: "tt", method: "thread.turns.list", params: { threadId: "thread-1" } }),
      router.handle({
        id: "st",
        method: "turn.steer",
        params: { profile, message: "continue", contexts: [context], threadId: "thread-1", expectedTurnId: "turn-1" },
      }),
      router.handle({ id: "it", method: "turn.interrupt", params: { threadId: "thread-1", turnId: "turn-1" } }),
    ]);

    expect(models.result).toEqual([
      {
        id: "gpt-5.4",
        label: "GPT-5.4",
        description: "Flagship",
        isDefault: true,
        supportsImages: true,
        reasoningEfforts: ["low", "medium", "high"],
      },
    ]);
    expect(threads.result).toEqual([
      {
        id: "thread-1",
        title: "Example thread",
        preview: "Example thread",
        updatedAt: 1_700_000_000_000,
        status: "running",
        cwd: "/tmp/project",
        source: "app-server",
      },
    ]);
    expect(rateLimits.result).toEqual({
      defaultBucket: {
        limitId: "codex",
        limitName: "Codex",
        planType: "pro",
        primary: {
          usedPercent: 42,
          windowDurationMins: 60,
          resetsAt: 1_700_000_000,
        },
        secondary: null,
      },
      buckets: [
        {
          limitId: "codex",
          limitName: "Codex",
          planType: "pro",
          primary: {
            usedPercent: 42,
            windowDurationMins: 60,
            resetsAt: 1_700_000_000,
          },
          secondary: null,
        },
      ],
    });
    expect(skills.result).toEqual([
      {
        id: "/tmp/project/.codex/skills/research/SKILL.md#research-helper",
        name: "research-helper",
        description: "Research helper",
        path: "/tmp/project/.codex/skills/research/SKILL.md",
        scope: "repo",
        cwd: "/tmp/project",
        token: "$research-helper",
      },
    ]);
    expect(apps.result).toEqual([
      {
        id: "demo-app",
        name: "Demo App",
        description: "Connector",
        path: "app://demo-app",
        token: "$demo-app",
        isAccessible: true,
        isEnabled: true,
        installUrl: "https://example.com/install",
      },
    ]);
    expect(plugins.result).toEqual([
      {
        id: "github@openai-curated",
        name: "GitHub",
        description: "GitHub connector",
        marketplaceName: "openai-curated",
        path: "plugin://github@openai-curated",
        token: "$github",
        installed: true,
        enabled: true,
        capabilities: ["repositories"],
      },
    ]);
    expect(mcpServers.result).toEqual([
      {
        id: "mcp:google-calendar",
        name: "google-calendar",
        description: "Ready MCP server with 1 tool: google-calendar",
        path: "mcp://google-calendar",
        token: "$google-calendar",
        authStatus: "oauth",
        isAuthenticated: true,
        toolCount: 1,
        tools: [{ name: "create_event", description: "Create an event", inputSchema: null }],
        resourceCount: 0,
        resourceTemplateCount: 0,
      },
    ]);
    expect(turns.result).toEqual([
      {
        id: "turn-1",
        status: "completed",
        startedAt: 1_700_000_000_000,
        completedAt: 1_700_000_030_000,
        durationMs: 30000,
      },
    ]);
    expect(steer.result).toEqual({ threadId: "thread-1", turnId: "turn-1" });
    expect(interrupt.result).toEqual({ threadId: "thread-1", turnId: "turn-1" });
  });

  test("routes login cancellation so OAuth attempts can be cleaned up", async () => {
    const cancelLogin = vi.fn(async () => undefined);
    const router = new BridgeRpcRouter(
      createDependencies({
        codex: {
          cancelLogin,
        },
      }),
    );

    const result = await router.handle({
      id: "cancel-login",
      method: "account.login.cancel",
      params: {
        loginId: "login-1",
      },
    });

    expect(cancelLogin).toHaveBeenCalledWith({ loginId: "login-1" });
    expect(result.result).toEqual({});
  });

  test("routes agentic planning through the route plane and streams route events", async () => {
    const emitted: BridgeEvent[] = [];
    const plan = vi.fn(async (_params: unknown, emit: (event: BridgeEvent) => void) => {
      emit({
        type: "route.plan.created",
        plan: {
          version: 1,
          source: "llm",
          task: "image-edit",
          contextMode: "page-only",
          contextRequests: [
            {
              source: "image",
              readStrategy: "vision",
              required: true,
              reason: "The model selected the visible page image as context.",
            },
          ],
          requiresVision: true,
          pageReadStrategy: "vision",
          selectedProfileId: "research-assistant",
          selectedModel: "gpt-5.4",
          imageEdit: {
            shouldEdit: true,
            target: "page-image",
            prompt: "Edit the visible image.",
            reason: "Image edit request.",
          },
          notes: [],
          confidence: 0.9,
        },
      });
      return {
        version: 1 as const,
        source: "llm" as const,
        task: "image-edit" as const,
        contextMode: "page-only" as const,
        contextRequests: [
          {
            source: "image" as const,
            readStrategy: "vision" as const,
            required: true,
            reason: "The model selected the visible page image as context.",
          },
        ],
        requiresVision: true,
        pageReadStrategy: "vision",
        selectedProfileId: "research-assistant",
        selectedModel: "gpt-5.4",
        imageEdit: {
          shouldEdit: true,
          target: "page-image" as const,
          prompt: "Edit the visible image.",
          reason: "Image edit request.",
        },
        notes: [],
        confidence: 0.9,
      };
    });
    const router = new BridgeRpcRouter(
      createDependencies({
        route: {
          plan,
        },
      }),
    );

    const result = await router.handle(
      {
        id: "route",
        method: "route.plan",
        params: {
          message: "이걸 조금 더 밝게 만들어줘",
          selectedProfileId: "research-assistant",
          selectedModel: "gpt-5.4",
          models: [],
          readStrategyOverride: "auto",
          explicitAttachments: [],
          fileAttachments: [],
        },
      },
      { emit: (event) => emitted.push(event) },
    );

    expect(plan).toHaveBeenCalledOnce();
    expect(result.result).toMatchObject({
      source: "llm",
      task: "image-edit",
      selectedProfileId: "research-assistant",
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ type: "route.plan.created" });
  });

  test("routes browser DOM action planning through the browser action plane", async () => {
    const emitted: BridgeEvent[] = [];
    const plan = vi.fn(async (_params: unknown, emit: (event: BridgeEvent) => void) => {
      const actionPlan = {
        shouldAct: true,
        summary: "Click the search button.",
        steps: [
          {
            action: "click" as const,
            targetRef: "dom-1",
            reason: "The user asked to click it.",
          },
        ],
        requiresConfirmation: true,
        confidence: 0.9,
      };
      emit({ type: "browser.action.plan.created", plan: actionPlan });
      return actionPlan;
    });
    const router = new BridgeRpcRouter(
      createDependencies({
        browserAction: {
          plan,
        },
      }),
    );

    const result = await router.handle(
      {
        id: "browser-action",
        method: "browser.action.plan",
        params: {
          message: "검색 버튼 눌러줘",
          snapshot: {
            metadata: { url: "https://example.com", title: "Example", domain: "example.com" },
            elements: [],
          },
        },
      },
      { emit: (event) => emitted.push(event) },
    );

    expect(plan).toHaveBeenCalledOnce();
    expect(result.result).toMatchObject({ shouldAct: true, summary: "Click the search button." });
    expect(emitted[0]).toMatchObject({ type: "browser.action.plan.created" });
  });

  test("passes WebRTC voice session params through and streams voice events", async () => {
    const emitted: BridgeEvent[] = [];
    const start = vi.fn(async (params: unknown, emit: (event: BridgeEvent) => void) => {
      emit({
        type: "voice.session.started",
        threadId: "thread-1",
        sessionId: "voice-1",
        transport: "webrtc",
      });
      return {
        status: "active" as const,
        threadId: "thread-1",
        sessionId: "voice-1",
        transport: "webrtc" as const,
      };
    });
    const router = new BridgeRpcRouter(
      createDependencies({
        voice: {
          start,
          appendText: vi.fn(),
          appendAudio: vi.fn(),
          stop: vi.fn(),
        },
      }),
    );

    const result = await router.handle(
      {
        id: "voice",
        method: "voice.session.start",
        params: {
          threadId: "thread-1",
          sdp: "offer-sdp",
          outputModality: "audio",
        },
      },
      { emit: (event) => emitted.push(event) },
    );

    expect(start).toHaveBeenCalledWith(
      {
        threadId: "thread-1",
        sdp: "offer-sdp",
        outputModality: "audio",
      },
      expect.any(Function),
    );
    expect(result.result).toEqual({
      status: "active",
      threadId: "thread-1",
      sessionId: "voice-1",
      transport: "webrtc",
    });
    expect(emitted).toEqual([
      {
        type: "voice.session.started",
        threadId: "thread-1",
        sessionId: "voice-1",
        transport: "webrtc",
      },
    ]);
  });

  test("routes dictation transcription through the voice transport without exposing voice RPC names", async () => {
    const start = vi.fn(async () => ({
      status: "active" as const,
      threadId: "thread-dictation",
      sessionId: "sidepanel-dictation-1",
      transport: "websocket" as const,
    }));
    const appendAudio = vi.fn(async () => undefined);
    const stop = vi.fn(async () => undefined);
    const router = new BridgeRpcRouter(
      createDependencies({
        voice: {
          start,
          appendText: vi.fn(),
          appendAudio,
          stop,
        },
      }),
    );

    const result = await router.handle({
      id: "dictation-start",
      method: "dictation.transcription.start",
      params: {
        outputModality: "text",
        sessionId: "sidepanel-dictation-1",
        prompt: "Transcribe only.",
      },
    });
    await router.handle({
      id: "dictation-audio",
      method: "dictation.transcription.append_audio",
      params: {
        threadId: "thread-dictation",
        audio: {
          data: "AA==",
          sampleRate: 24000,
          numChannels: 1,
          samplesPerChannel: 1,
        },
      },
    });
    await router.handle({
      id: "dictation-stop",
      method: "dictation.transcription.stop",
      params: { threadId: "thread-dictation" },
    });

    expect(start).toHaveBeenCalledWith(
      {
        outputModality: "text",
        sessionId: "sidepanel-dictation-1",
        prompt: "Transcribe only.",
      },
      expect.any(Function),
    );
    expect(appendAudio).toHaveBeenCalledWith({
      threadId: "thread-dictation",
      audio: {
        data: "AA==",
        sampleRate: 24000,
        numChannels: 1,
        samplesPerChannel: 1,
      },
    });
    expect(stop).toHaveBeenCalledWith({ threadId: "thread-dictation" });
    expect(result.result).toMatchObject({
      status: "active",
      threadId: "thread-dictation",
      sessionId: "sidepanel-dictation-1",
    });
  });
});

function createDependencies(overrides: Partial<BridgeDependencies> = {}): BridgeDependencies {
  const base: BridgeDependencies = {
    codex: {
      accountStatus: async () => ({
        authMode: "chatgpt",
        codexAuthenticated: true,
        multimodalAvailable: false,
        openAiApiKeyConfigured: false,
      }),
      login: async () => ({ authMode: "chatgpt" }),
      cancelLogin: async () => undefined,
      logout: async () => undefined,
      listModels: async () => [
        {
          id: "gpt-5.4",
          label: "GPT-5.4",
          description: "Flagship",
          isDefault: true,
          supportsImages: true,
          reasoningEfforts: ["low", "medium", "high"],
        },
      ],
      listThreads: async () => [
        {
          id: "thread-1",
          title: "Example thread",
          preview: "Example thread",
          updatedAt: 1_700_000_000_000,
          status: "running",
          cwd: "/tmp/project",
          source: "app-server",
        },
      ],
      readThread: async () => ({
        id: "thread-1",
        title: "Example thread",
        preview: "Example thread",
        updatedAt: 1_700_000_000_000,
        status: "running",
        cwd: "/tmp/project",
        messages: [],
      }),
      listTurns: async () => [
        {
          id: "turn-1",
          status: "completed",
          startedAt: 1_700_000_000_000,
          completedAt: 1_700_000_030_000,
          durationMs: 30000,
        },
      ],
      listSkills: async () => [
        {
          id: "/tmp/project/.codex/skills/research/SKILL.md#research-helper",
          name: "research-helper",
          description: "Research helper",
          path: "/tmp/project/.codex/skills/research/SKILL.md",
          scope: "repo",
          cwd: "/tmp/project",
          token: "$research-helper",
        },
      ],
      listApps: async () => [
        {
          id: "demo-app",
          name: "Demo App",
          description: "Connector",
          path: "app://demo-app",
          token: "$demo-app",
          isAccessible: true,
          isEnabled: true,
          installUrl: "https://example.com/install",
        },
      ],
      listPlugins: async () => [
        {
          id: "github@openai-curated",
          name: "GitHub",
          description: "GitHub connector",
          marketplaceName: "openai-curated",
          path: "plugin://github@openai-curated",
          token: "$github",
          installed: true,
          enabled: true,
          capabilities: ["repositories"],
        },
      ],
      listMcpServers: async () => [
        {
          id: "mcp:google-calendar",
          name: "google-calendar",
          description: "Ready MCP server with 1 tool: google-calendar",
          path: "mcp://google-calendar",
          token: "$google-calendar",
          authStatus: "oauth",
          isAuthenticated: true,
          toolCount: 1,
          tools: [{ name: "create_event", description: "Create an event", inputSchema: null }],
          resourceCount: 0,
          resourceTemplateCount: 0,
        },
      ],
      startMcpOauthLogin: async () => ({ authorizationUrl: "https://example.com/oauth" }),
      callMcpTool: async () => ({ content: [], structuredContent: { ok: true }, isError: false }),
      reloadMcpServers: async () => ({ ok: true }),
      readRateLimits: async () => ({
        defaultBucket: {
          limitId: "codex",
          limitName: "Codex",
          planType: "pro",
          primary: {
            usedPercent: 42,
            windowDurationMins: 60,
            resetsAt: 1_700_000_000,
          },
          secondary: null,
        },
        buckets: [
          {
            limitId: "codex",
            limitName: "Codex",
            planType: "pro",
            primary: {
              usedPercent: 42,
              windowDurationMins: 60,
              resetsAt: 1_700_000_000,
            },
            secondary: null,
          },
        ],
      }),
      openSession: async () => ({ threadId: "thread-1" }),
      resumeSession: async () => ({ threadId: "thread-1" }),
      sendPrompt: async () => ({ threadId: "thread-1", turnId: "turn-1" }),
      compactThread: async () => ({ threadId: "thread-1", status: "started" }),
      steerTurn: async () => ({ threadId: "thread-1", turnId: "turn-1" }),
      interruptTurn: async () => ({ threadId: "thread-1", turnId: "turn-1" }),
    },
    voice: {
      start: async () => ({ status: "active", sessionId: "voice-1" }),
      appendText: async () => undefined,
      appendAudio: async () => undefined,
      stop: async () => undefined,
    },
    translation: {
      saveApiKey: async () => ({ stored: true }),
      clearApiKey: async () => ({ cleared: true }),
      createClientSecret: async () => ({
        value: "ek_test",
        expiresAt: 1_700_000_600,
        sessionId: "sess_test",
        model: "gpt-realtime-translate",
        targetLanguage: "ko",
      }),
    },
    image: {
      startEdit: async () => ({ jobId: "image-1", previewRef: "preview://1" }),
      startGenerate: async () => ({ jobId: "image-generate-1", previewRef: "preview://generated" }),
      previewEdit: async () => ({ previewRef: "preview://1" }),
      readAsset: async () => ({
        previewRef: "codex-asset:00000000-0000-4000-8000-000000000000",
        dataBase64: "",
        mimeType: "image/png",
        sizeBytes: 0,
        offset: 0,
        nextOffset: 0,
        done: true,
      }),
      describeAssetFolder: async () => ({
        rootDir: "/tmp/codex-images",
        latestFolder: "/tmp/codex-images",
        folders: ["/tmp/codex-images"],
        assetCount: 1,
        latestAssetPath: "/tmp/codex-images/generated.png",
      }),
      openAssetFolder: async () => ({ opened: true, folder: "/tmp/codex-images" }),
      deleteAsset: async ({ previewRef }: { previewRef: string }) => ({
        deleted: true,
        previewRef,
        path: "/tmp/codex-images/generated.png",
      }),
    },
    localFiles: {
      reveal: async ({ path }: { path: string }) => ({
        opened: true,
        path,
        folder: "/tmp/codex-images",
      }),
    },
    route: {
      plan: async () => ({
        version: 1,
        source: "fallback",
        task: "general",
        contextMode: "none",
        contextRequests: [],
        requiresVision: false,
        pageReadStrategy: "auto",
        selectedProfileId: "research-assistant",
        selectedModel: "gpt-5.4",
        imageEdit: {
          shouldEdit: false,
          target: "none",
          reason: "No image edit requested.",
        },
        notes: [],
        confidence: 0,
      }),
    },
    browserAction: {
      plan: async () => ({
        shouldAct: true,
        summary: "Click the requested element.",
        steps: [
          {
            action: "click",
            targetRef: "dom-1",
            reason: "Requested by the user.",
          },
        ],
        requiresConfirmation: true,
        confidence: 0.8,
      }),
    },
    workspace: {
      readHarness: async () => ({
        workspaceRoot: "/tmp/project",
        configSources: [],
        instructionSources: [],
        permissions: {
          defaultMode: "default",
          allow: ["prompt.send", "context.tabs.read"],
          ask: [],
          deny: [],
        },
        hooks: {
          enabled: false,
          eventCount: 0,
        },
        shortcuts: [],
      }),
      readConfig: async () => ({
        workspaceRoot: "/tmp/project",
        codexBinPath: "",
        resolvedCodexBinPath: "/opt/homebrew/bin/codex",
        codexBinSource: "path",
        configuredCodexBinPathInvalid: false,
      }),
      updateConfig: async () => ({
        workspaceRoot: "/tmp/project",
        codexBinPath: "",
        resolvedCodexBinPath: "/opt/homebrew/bin/codex",
        codexBinSource: "path",
        configuredCodexBinPathInvalid: false,
      }),
      readPlaywrightRuntime: async () => ({
        available: false,
        packageName: "playwright-core",
        packageVersion: "1.59.1",
        browserInstalled: false,
        browserExecutablePath: "",
        installable: true,
        installCommand: "node cli.js install chromium",
        message: "Playwright package is installed, but Chromium runtime is missing.",
      }),
      installPlaywrightRuntime: async () => ({
        available: true,
        packageName: "playwright-core",
        packageVersion: "1.59.1",
        browserInstalled: true,
        browserExecutablePath: "/tmp/chromium",
        installable: true,
        installCommand: "node cli.js install chromium",
        message: "Playwright Chromium runtime is installed.",
      }),
      listExternalSkills: async () => [],
      listExternalSkillRoots: async () => [],
      installSkillArchive: async () => ({
        rootDir: "/tmp/project/.codex-sidepanel/external-skills/demo",
        skills: [],
      }),
    },
  };

  return {
    ...base,
    ...overrides,
    codex: {
      ...base.codex,
      ...overrides.codex,
    },
    voice: {
      ...base.voice,
      ...overrides.voice,
    },
    translation: {
      ...base.translation,
      ...overrides.translation,
    },
    image: {
      ...base.image,
      ...overrides.image,
    },
    workspace: {
      ...base.workspace,
      ...overrides.workspace,
    },
  };
}
