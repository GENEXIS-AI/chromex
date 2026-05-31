import { describe, expect, test } from "vitest";

import {
  createAvailableRouteStructuredInputs,
  expandPluginStructuredInputsWithConnectedApps,
  mergeExplicitAndRouteStructuredInputs,
  resolveRouteStructuredInputs,
} from "../src/background/route-structured-inputs.js";

describe("route structured inputs", () => {
  test("builds planner-visible inputs only from usable apps, plugins, and MCP servers", () => {
    const inputs = createAvailableRouteStructuredInputs({
      apps: [
        {
          id: "gmail",
          name: "Gmail",
          description: "Read and manage Gmail",
          path: "app://gmail",
          token: "$gmail",
          isAccessible: true,
          isEnabled: true,
        },
        {
          id: "not-installed",
          name: "Missing App",
          description: "",
          path: "app://missing",
          token: "$missing",
          isAccessible: false,
          isEnabled: true,
        },
      ],
      plugins: [
        {
          id: "github@openai-curated",
          name: "GitHub",
          description: "Triage repositories",
          marketplaceName: "openai-curated",
          path: "plugin://github@openai-curated",
          token: "$github",
          installed: true,
          enabled: true,
          capabilities: ["repositories"],
        },
        {
          id: "disabled@openai-curated",
          name: "Disabled",
          description: "",
          marketplaceName: "openai-curated",
          path: "plugin://disabled@openai-curated",
          token: "$disabled",
          installed: true,
          enabled: false,
          capabilities: [],
        },
      ],
      mcpServers: [
        {
          id: "mcp:google-calendar",
          name: "Google Calendar",
          description: "Manage calendar events",
          path: "mcp://Google%20Calendar",
          token: "$google-calendar",
          authStatus: "oauth",
          isAuthenticated: true,
          toolCount: 3,
          tools: [],
          resourceCount: 0,
          resourceTemplateCount: 0,
        },
        {
          id: "mcp:logged-out",
          name: "Logged Out",
          description: "",
          path: "mcp://Logged%20Out",
          token: "$logged-out",
          authStatus: "notLoggedIn",
          isAuthenticated: false,
          toolCount: 2,
          tools: [],
          resourceCount: 0,
          resourceTemplateCount: 0,
        },
      ],
    });

    expect(inputs.map((input) => input.id)).toEqual([
      "gmail",
      "github@openai-curated",
      "mcp:google-calendar",
    ]);
  });

  test("does not expose app-backed plugins to the planner until the companion app is accessible", () => {
    const inputs = createAvailableRouteStructuredInputs({
      apps: [
        {
          id: "connector_gmail",
          name: "Gmail",
          description: "Read and manage Gmail",
          path: "app://connector_gmail",
          token: "$gmail",
          isAccessible: false,
          isEnabled: true,
        },
      ],
      plugins: [
        {
          id: "gmail@openai-curated",
          name: "Gmail",
          description: "Read and manage Gmail",
          marketplaceName: "openai-curated",
          path: "plugin://gmail@openai-curated",
          token: "$gmail",
          installed: true,
          enabled: true,
          capabilities: ["mail"],
        },
      ],
      mcpServers: [],
    });

    expect(inputs).toEqual([]);
  });

  test("resolves planner-selected inputs and preserves explicit user selections first", () => {
    const availableStructuredInputs = createAvailableRouteStructuredInputs({
      apps: [
        {
          id: "gmail",
          name: "Gmail",
          description: "Read and manage Gmail",
          path: "app://gmail",
          token: "$gmail",
          isAccessible: true,
          isEnabled: true,
        },
      ],
      plugins: [],
      mcpServers: [
        {
          id: "mcp:google-calendar",
          name: "Google Calendar",
          description: "Manage calendar events",
          path: "mcp://Google%20Calendar",
          token: "$google-calendar",
          authStatus: "oauth",
          isAuthenticated: true,
          toolCount: 3,
          tools: [],
          resourceCount: 0,
          resourceTemplateCount: 0,
        },
      ],
    });

    const resolved = resolveRouteStructuredInputs(
      {
        structuredInputIds: ["mcp:google-calendar", "missing"],
      },
      { availableStructuredInputs },
    );
    const merged = mergeExplicitAndRouteStructuredInputs(
      [
        {
          id: "gmail",
          type: "mention",
          name: "Gmail",
          path: "app://gmail",
          token: "$gmail",
        },
      ],
      resolved,
    );

    expect(resolved.map((input) => input.id)).toEqual(["mcp:google-calendar"]);
    expect(merged.map((input) => input.id)).toEqual(["gmail", "mcp:google-calendar"]);
  });

  test("adds the connected app mention needed by app-server when a plugin mention owns app tools", () => {
    const expanded = expandPluginStructuredInputsWithConnectedApps(
      [
        {
          id: "gmail@openai-curated",
          type: "mention",
          name: "Gmail",
          path: "plugin://gmail@openai-curated",
          token: "$gmail",
        },
      ],
      [
        {
          id: "connector_2128aebfecb84f64a069897515042a44",
          name: "Gmail",
          description: "Read and manage Gmail",
          path: "app://connector_2128aebfecb84f64a069897515042a44",
          token: "$gmail",
          isAccessible: true,
          isEnabled: true,
        },
      ],
    );

    expect(expanded).toEqual([
      {
        id: "connector_2128aebfecb84f64a069897515042a44",
        type: "mention",
        name: "Gmail",
        path: "app://connector_2128aebfecb84f64a069897515042a44",
        description: "Read and manage Gmail",
        token: "$gmail",
      },
      {
        id: "gmail@openai-curated",
        type: "mention",
        name: "Gmail",
        path: "plugin://gmail@openai-curated",
        token: "$gmail",
      },
    ]);
  });

  test("matches hyphenated plugin metadata to spaced companion app names", () => {
    const expanded = expandPluginStructuredInputsWithConnectedApps(
      [
        {
          id: "google-calendar@openai-curated",
          type: "mention",
          name: "google-calendar",
          path: "plugin://google-calendar@openai-curated",
          token: "$google-calendar",
        },
      ],
      [
        {
          id: "connector_google_calendar",
          name: "Google Calendar",
          description: "Manage events",
          path: "app://connector_google_calendar",
          token: "$google calendar",
          isAccessible: true,
          isEnabled: true,
        },
      ],
    );

    expect(expanded.map((input) => input.path)).toEqual([
      "app://connector_google_calendar",
      "plugin://google-calendar@openai-curated",
    ]);
  });
});
