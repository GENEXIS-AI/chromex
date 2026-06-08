import { describe, expect, test } from "vitest";

import {
  normalizePanelConversation,
  normalizeSidepanelCollections,
  serializeConversationMessagesForStorage,
  shouldApplyConversationSaveResultToActiveChat,
  shouldHydrateInitConversation,
  shouldPersistConversationMessagesForStorage,
} from "../src/sidepanel/sidepanel-state.js";

describe("sidepanel state normalization", () => {
  test("defaults missing collection payload fields to arrays before render code calls slice", () => {
    expect(normalizeSidepanelCollections({})).toEqual({
      models: [],
      profiles: [],
      actionCards: [],
      skills: [],
      appServerSkills: [],
      connectedApps: [],
      appServerPlugins: [],
      mcpServers: [],
      recentChats: [],
      serverThreads: [],
    });
  });

  test("does not mark empty local drafts as recent-chat history", () => {
    expect(shouldPersistConversationMessagesForStorage([])).toBe(false);
    expect(shouldPersistConversationMessagesForStorage([{ id: "user-1", role: "user", text: "Hello" }])).toBe(true);
  });

  test("does not move the active chat when a stale save response returns late", () => {
    expect(
      shouldApplyConversationSaveResultToActiveChat({
        saveStartedConversationId: "old-chat",
        currentConversationId: "new-chat",
        savedConversationId: "old-chat",
      }),
    ).toBe(false);
  });

  test("applies save results for the still-active chat", () => {
    expect(
      shouldApplyConversationSaveResultToActiveChat({
        saveStartedConversationId: "active-chat",
        currentConversationId: "active-chat",
        savedConversationId: "active-chat",
      }),
    ).toBe(true);
  });

  test("does not hydrate a stale init payload after the active chat changed", () => {
    expect(
      shouldHydrateInitConversation({
        currentConversationIdBeforeInit: "old-chat",
        currentConversationIdNow: "new-chat",
        payloadConversationId: "old-chat",
      }),
    ).toBe(false);
  });

  test("hydrates init payloads that match the current active chat", () => {
    expect(
      shouldHydrateInitConversation({
        currentConversationIdBeforeInit: "old-chat",
        currentConversationIdNow: "new-chat",
        payloadConversationId: "new-chat",
      }),
    ).toBe(true);
  });

  test("hydrates older saved conversations with missing array fields safely", () => {
    const conversation = normalizePanelConversation({
      id: "chat-1",
      title: "Old chat",
      profileId: "research-assistant",
      messages: [{ id: "m1", role: "user" }],
    });

    expect(conversation).toMatchObject({
      id: "chat-1",
      messages: [{ id: "m1", role: "user", text: "" }],
      attachments: [],
      structuredInputs: [],
      selectedTabIds: [],
      historyQuery: "",
      readStrategyOverride: "auto",
    });
  });

  test("defaults missing saved conversation profile ids to the blank profile", () => {
    const conversation = normalizePanelConversation({
      id: "chat-without-profile",
      title: "Old chat",
      messages: [],
    });

    expect(conversation?.profileId).toBe("default");
  });

  test("preserves message page context for YouTube timestamp rendering", () => {
    const conversation = normalizePanelConversation({
      id: "youtube-chat",
      title: "YouTube chat",
      profileId: "youtube-summarizer",
      messages: [
        {
          id: "user-1",
          role: "user",
          text: "Summarize video",
          context: {
            platform: "youtube",
            url: "https://www.youtube.com/watch?v=demo",
            title: "Demo Video",
          },
        },
      ],
    });

    expect(conversation?.messages[0]?.context).toEqual({
      platform: "youtube",
      url: "https://www.youtube.com/watch?v=demo",
      title: "Demo Video",
    });
    expect(serializeConversationMessagesForStorage(conversation?.messages ?? [])[0]?.context).toEqual({
      platform: "youtube",
      url: "https://www.youtube.com/watch?v=demo",
      title: "Demo Video",
    });
  });

  test("preserves generated image previews when hydrating conversations", () => {
    const conversation = normalizePanelConversation({
      id: "chat-2",
      title: "Image chat",
      profileId: "image-editor",
      messages: [
        {
          id: "m1",
          role: "assistant",
          text: "이미지를 편집했습니다.",
          images: [{ src: "data:image/png;base64,abc123", alt: "Edited image" }],
        },
      ],
    });

    expect(conversation?.messages[0]).toMatchObject({
      id: "m1",
      role: "assistant",
      text: "이미지를 편집했습니다.",
      images: [{ src: "data:image/png;base64,abc123", alt: "Edited image" }],
    });
  });

  test("preserves bridge asset references when hydrating generated image previews", () => {
    const conversation = normalizePanelConversation({
      id: "chat-3",
      title: "Image chat",
      profileId: "image-editor",
      messages: [
        {
          id: "m1",
          role: "assistant",
          text: "이미지를 편집했습니다.",
          images: [
            {
              src: "",
              alt: "Edited image",
              assetRef: "codex-asset:generated-1",
              status: "loading",
            },
          ],
        },
      ],
    });

    expect(conversation?.messages[0]).toMatchObject({
      id: "m1",
      images: [
        {
          src: "",
          alt: "Edited image",
          assetRef: "codex-asset:generated-1",
          status: "loading",
        },
      ],
    });
  });

  test("does not persist stale blob image urls when an asset ref is available", () => {
    const messages = serializeConversationMessagesForStorage([
      {
        id: "m1",
        role: "assistant",
        text: "이미지를 편집했습니다.",
        images: [
          {
            src: "blob:sidepanel-preview",
            alt: "Edited image",
            assetRef: "codex-asset:generated-1",
            status: "ready",
          },
        ],
      },
    ]);

    expect(messages[0]?.images).toEqual([
      {
        src: "",
        alt: "Edited image",
        assetRef: "codex-asset:generated-1",
        status: "loading",
      },
    ]);
  });

  test("persists bridge-backed generated images by asset ref instead of large data urls", () => {
    const messages = serializeConversationMessagesForStorage([
      {
        id: "m1",
        role: "assistant",
        text: "이미지를 만들었습니다.",
        images: [
          {
            src: "data:image/png;base64,abc123",
            alt: "Generated image",
            assetRef: "codex-asset:generated-1",
            status: "ready",
          },
        ],
      },
    ]);

    expect(messages[0]?.images).toEqual([
      {
        src: "",
        alt: "Generated image",
        assetRef: "codex-asset:generated-1",
        status: "loading",
      },
    ]);
  });

  test("drops oversized inline image previews before conversation storage", () => {
    const largeDataUrl = `data:image/png;base64,${"a".repeat(140 * 1024)}`;
    const messages = serializeConversationMessagesForStorage([
      {
        id: "m1",
        role: "user",
        text: "이 이미지 참고해줘",
        attachments: [
          {
            id: "file-1",
            name: "large.png",
            mimeType: "image/png",
            kind: "image",
            sizeBytes: 500_000,
            previewSrc: largeDataUrl,
          },
        ],
      },
    ]);

    expect(messages[0]?.attachments?.[0]).toMatchObject({
      id: "file-1",
      name: "large.png",
      kind: "image",
    });
    expect(messages[0]?.attachments?.[0]?.previewSrc).toBeUndefined();
  });

  test("removes inline base64 image markdown from stored message text", () => {
    const messages = serializeConversationMessagesForStorage([
      {
        id: "m1",
        role: "assistant",
        text: "이미지입니다 ![x](data:image/png;base64,abc123) 끝",
      },
    ]);

    expect(messages[0]?.text).toBe("이미지입니다 ![x]([stored image asset]) 끝");
  });

  test("keeps stale blob-only generated images as deleted placeholders", () => {
    const conversation = normalizePanelConversation({
      id: "chat-blob-only",
      title: "Old image chat",
      profileId: "default",
      messages: [
        {
          id: "m1",
          role: "assistant",
          text: "이미지 결과입니다.",
          images: [
            {
              src: "blob:stale-preview",
              alt: "Generated image",
              status: "ready",
            },
          ],
        },
      ],
    });

    expect(conversation?.messages[0]?.images).toEqual([
      {
        src: "",
        alt: "Generated image",
        status: "deleted",
      },
    ]);
    expect(serializeConversationMessagesForStorage(conversation?.messages ?? [])[0]?.images).toEqual([
      {
        src: "",
        alt: "Generated image",
        status: "deleted",
      },
    ]);
  });

  test("preserves the profile used when a user message was sent", () => {
    const conversation = normalizePanelConversation({
      id: "chat-4",
      title: "Profile chat",
      profileId: "marketing-strategist",
      messages: [
        {
          id: "m1",
          role: "user",
          text: "랜딩페이지 훅 뽑아줘",
          profile: {
            id: "marketing-strategist",
            name: "Marketing Strategist",
            color: "#ff8848",
            icon: "briefcase",
          },
        },
      ],
    });

    expect(conversation?.messages[0]).toMatchObject({
      profile: {
        id: "marketing-strategist",
        name: "Marketing Strategist",
        color: "#ff8848",
        icon: "briefcase",
      },
    });
    expect(serializeConversationMessagesForStorage(conversation?.messages ?? [])[0]).toMatchObject({
      profile: {
        id: "marketing-strategist",
        name: "Marketing Strategist",
        color: "#ff8848",
        icon: "briefcase",
      },
    });
  });

  test("preserves selected plugin mentions on user messages without storing runtime tokens", () => {
    const conversation = normalizePanelConversation({
      id: "plugin-chat",
      title: "Plugin chat",
      profileId: "default",
      messages: [
        {
          id: "m1",
          role: "user",
          text: "메일함에서 답장 필요한 것 정리해줘",
          structuredInputs: [
            {
              id: "gmail@openai-curated",
              type: "mention",
              name: "Gmail",
              path: "plugin://gmail@openai-curated",
              description: "Read and manage Gmail",
              iconUrl: "https://example.com/gmail.png",
              token: "$gmail",
            },
          ],
        },
      ],
    } as any);

    expect(conversation?.messages[0]).toMatchObject({
      structuredInputs: [
        {
          id: "gmail@openai-curated",
          type: "mention",
          name: "Gmail",
          path: "plugin://gmail@openai-curated",
          description: "Read and manage Gmail",
          iconUrl: "https://example.com/gmail.png",
        },
      ],
    });
    expect(serializeConversationMessagesForStorage(conversation?.messages ?? [])[0]).toMatchObject({
      structuredInputs: [
        {
          id: "gmail@openai-curated",
          type: "mention",
          name: "Gmail",
          path: "plugin://gmail@openai-curated",
          description: "Read and manage Gmail",
          iconUrl: "https://example.com/gmail.png",
        },
      ],
    });
    expect(
      JSON.stringify(serializeConversationMessagesForStorage(conversation?.messages ?? [])[0]),
    ).not.toContain("$gmail");
  });

  test("preserves user-visible attachment previews when hydrating and storing conversations", () => {
    const conversation = normalizePanelConversation({
      id: "attachment-chat",
      title: "Attachment chat",
      profileId: "default",
      messages: [
        {
          id: "m1",
          role: "user",
          text: "이 이미지 참고해서 다시 만들어줘",
          attachments: [
            {
              id: "file-1",
              name: "reference.png",
              mimeType: "image/png",
              kind: "image",
              sizeBytes: 1234,
              previewSrc: "data:image/png;base64,abc123",
              role: "reference",
            },
            {
              id: "file-2",
              name: "brief.pdf",
              mimeType: "application/pdf",
              kind: "pdf",
              sizeBytes: 4567,
            },
          ],
        },
      ],
    } as any);

    expect(conversation?.messages[0]).toMatchObject({
      attachments: [
        {
          id: "file-1",
          name: "reference.png",
          mimeType: "image/png",
          kind: "image",
          sizeBytes: 1234,
          previewSrc: "data:image/png;base64,abc123",
          role: "reference",
        },
        {
          id: "file-2",
          name: "brief.pdf",
          mimeType: "application/pdf",
          kind: "pdf",
          sizeBytes: 4567,
        },
      ],
    });
    expect(serializeConversationMessagesForStorage(conversation?.messages ?? [])[0]).toMatchObject({
      attachments: [
        {
          id: "file-1",
          name: "reference.png",
          previewSrc: "data:image/png;base64,abc123",
          role: "reference",
        },
        {
          id: "file-2",
          name: "brief.pdf",
          kind: "pdf",
        },
      ],
    });
  });

  test("preserves voice message metadata when hydrating and storing conversations", () => {
    const conversation = normalizePanelConversation({
      id: "voice-chat",
      title: "Voice chat",
      profileId: "default",
      messages: [
        {
          id: "voice-user-1",
          role: "user",
          text: "지금 화면 설명해줘.",
          delivery: "voice",
          voice: { startedAt: 10_000, durationMs: 1_800 },
        },
      ],
    });

    expect(conversation?.messages[0]).toMatchObject({
      delivery: "voice",
      voice: { startedAt: 10_000, durationMs: 1_800 },
    });
    expect(serializeConversationMessagesForStorage(conversation?.messages ?? [])[0]).toMatchObject({
      delivery: "voice",
      voice: { startedAt: 10_000, durationMs: 1_800 },
    });
  });

  test("preserves steer markers when hydrating and storing conversations", () => {
    const conversation = normalizePanelConversation({
      id: "steer-chat",
      title: "Steer chat",
      profileId: "default",
      messages: [
        {
          id: "steer-user-1",
          role: "user",
          text: "길게 생각해",
          steer: true,
        },
      ],
    });

    expect(conversation?.messages[0]).toMatchObject({
      role: "user",
      steer: true,
    });
    expect(serializeConversationMessagesForStorage(conversation?.messages ?? [])[0]).toMatchObject({
      role: "user",
      steer: true,
    });
  });

  test("drops transient trace-only assistant messages from saved chat history", () => {
    const conversation = normalizePanelConversation({
      id: "trace-chat",
      title: "Trace chat",
      profileId: "default",
      messages: [
        {
          id: "turn-trace-thread-1-turn-1",
          role: "assistant",
          text: "",
          trace: [
            {
              id: "web-1",
              kind: "web",
              title: "Searching the web",
              detail: "query",
              status: "completed",
              timestampMs: 1,
            },
          ],
        },
        {
          id: "assistant-1",
          role: "assistant",
          text: "최종 답변입니다.",
        },
      ],
    });

    expect(conversation?.messages.map((message) => message.id)).toEqual(["assistant-1"]);
    expect(
      serializeConversationMessagesForStorage([
        {
          id: "turn-trace-thread-1-turn-1",
          role: "assistant",
          text: "",
          trace: [
            {
              id: "web-1",
              kind: "web",
              title: "Searching the web",
              detail: "query",
              status: "completed",
              timestampMs: 1,
            },
          ],
        },
        {
          id: "assistant-1",
          role: "assistant",
          text: "최종 답변입니다.",
        },
      ]),
    ).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        text: "최종 답변입니다.",
      },
    ]);
  });
});
