import { describe, expect, test } from "vitest";

import type { PageContextEnvelope, ProfileTemplate } from "@codex-sidepanel/shared";
import {
  mapApps,
  mapMcpServerStatusResponse,
  mapModels,
  mapPlugins,
  mapThreadTranscript,
} from "../src/app-server-mappers.js";
import { createCodexTurnInput } from "../src/index.js";

const profile: ProfileTemplate = {
  id: "marketing-copilot",
  name: "Marketing Copilot",
  systemPrompt: "Write with the AIDA framework and include strong hooks.",
  defaultContextPolicy: {
    attachCurrentPageByDefault: false,
    allowedReadStrategies: ["dom"],
  },
  allowedSources: ["current-page"],
  preferredActions: [],
  adapterHints: [],
};

const context: PageContextEnvelope = {
  metadata: {
    url: "https://example.com",
    title: "Example",
    domain: "example.com",
  },
  selectionText: "",
  domSummary: "Private page facts.",
  visionAssets: [],
  adapterPayload: null,
  privacyFlags: {
    containsSensitiveFormData: false,
    userConsentedToHistory: false,
  },
};

describe("mapThreadTranscript", () => {
  test("preserves app-server model tool capability metadata", () => {
    expect(
      mapModels([
        {
          id: "gpt-5.4",
          model: "gpt-5.4",
          displayName: "GPT-5.4",
          description: "Frontier model",
          supportsParallelToolCalls: true,
          supportsSearchTool: true,
        },
      ] as never)[0],
    ).toMatchObject({
      id: "gpt-5.4",
      supportsParallelToolCalls: true,
      supportsSearchTool: true,
    });
  });

  test("maps app-server MCP server status into side-panel catalog options", () => {
    expect(
      mapMcpServerStatusResponse({
        data: [
          {
            name: "google-calendar",
            auth_status: "oauth",
            tools: [
              {
                name: "events.create",
                description: "Create a calendar event",
                input_schema: {
                  type: "object",
                  properties: {
                    summary: { type: "string" },
                  },
                },
              },
            ],
          },
          {
            name: "local-files",
            auth_status: "unsupported",
            tools: [],
          },
        ],
        nextCursor: "next-page",
      }).servers,
    ).toEqual([
      {
        id: "mcp:google-calendar",
        name: "google-calendar",
        description: "Ready MCP server with 1 tool: google-calendar",
        path: "mcp://google-calendar",
        token: "$google-calendar",
        authStatus: "oauth",
        isAuthenticated: true,
        toolCount: 1,
        tools: [
          {
            name: "events.create",
            description: "Create a calendar event",
            inputSchema: {
              type: "object",
              properties: {
                summary: { type: "string" },
              },
            },
          },
        ],
        resourceCount: 0,
        resourceTemplateCount: 0,
      },
      {
        id: "mcp:local-files",
        name: "local-files",
        description: "Ready MCP server with 0 tools: local-files",
        path: "mcp://local-files",
        token: "$local-files",
        authStatus: "unsupported",
        isAuthenticated: true,
        toolCount: 0,
        tools: [],
        resourceCount: 0,
        resourceTemplateCount: 0,
      },
    ]);
  });

  test("maps installed app-server plugins such as Gmail into side-panel catalog options", () => {
    expect(
      mapPlugins({
        marketplaces: [
          {
            name: "openai-curated",
            plugins: [
              {
                id: "gmail@openai-curated",
                name: "gmail",
                installed: true,
                enabled: true,
                interface: {
                  displayName: "Gmail",
                  shortDescription: "Read and manage Gmail",
                  logoUrl: "https://example.com/gmail.png",
                  capabilities: ["Interactive", "Write"],
                },
              },
              {
                id: "google-calendar@openai-curated",
                name: "google-calendar",
                installed: false,
                enabled: false,
                interface: {
                  displayName: "Google Calendar",
                  shortDescription: "Manage Google Calendar events and schedules",
                  capabilities: ["Interactive", "Write"],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        id: "gmail@openai-curated",
        name: "Gmail",
        description: "Read and manage Gmail",
        marketplaceName: "openai-curated",
        path: "plugin://gmail@openai-curated",
        token: "$gmail",
        installed: true,
        enabled: true,
        iconUrl: "https://example.com/gmail.png",
        capabilities: ["Interactive", "Write"],
      },
    ]);
  });

  test("maps snake_case app-server app fields into connected app options", () => {
    expect(
      mapApps([
        {
          id: "connector_gmail",
          name: "Gmail",
          description: "Read and manage Gmail",
          is_accessible: true,
          is_enabled: true,
          install_url: "https://chatgpt.com/g/gmail",
          logo_url: "https://example.com/gmail.png",
        },
      ] as never),
    ).toEqual([
      {
        id: "connector_gmail",
        name: "Gmail",
        description: "Read and manage Gmail",
        path: "app://connector_gmail",
        token: "$gmail",
        isAccessible: true,
        isEnabled: true,
        installUrl: "https://chatgpt.com/g/gmail",
        iconUrl: "https://example.com/gmail.png",
      },
    ]);
  });

  test("shows only the user request for side-panel chat messages", () => {
    const input = createCodexTurnInput({
      profile,
      message: "랜딩페이지 훅을 5개 만들어줘.",
      contexts: [context],
    });

    const transcript = mapThreadTranscript({
      id: "thread-1",
      turns: [
        {
          id: "turn-1",
          items: [
            {
              type: "userMessage",
              id: "user-1",
              content: [{ type: "text", text: input }],
            },
          ],
        },
      ],
    });

    expect(transcript.messages[0]?.text).toBe("랜딩페이지 훅을 5개 만들어줘.");
    expect(transcript.messages[0]?.text).not.toContain("PRIVATE INSTRUCTION PROFILE");
    expect(transcript.messages[0]?.text).not.toContain(profile.systemPrompt);
    expect(transcript.messages[0]?.text).not.toContain("PRIVATE PAGE CONTEXT");
  });
});
