import { describe, expect, test } from "vitest";

import { matchesHarnessPattern, resolveHarnessPermission } from "../src/index.js";

describe("matchesHarnessPattern", () => {
  test("supports exact and wildcard matches", () => {
    expect(matchesHarnessPattern("page.*", "page.navigate")).toBe(true);
    expect(matchesHarnessPattern("context.history.read", "context.history.read")).toBe(true);
    expect(matchesHarnessPattern("image.*", "page.navigate")).toBe(false);
  });
});

describe("resolveHarnessPermission", () => {
  test("denies browser mutations when browser actions are disabled", () => {
    const result = resolveHarnessPermission(
      {
        defaultMode: "acceptBrowserActions",
        allow: [],
        ask: [],
        deny: [],
      },
      "page.navigate",
      {
        browserActionsEnabled: false,
      },
    );

    expect(result.decision).toBe("deny");
  });

  test("prompts for browser-mutating risky actions in default mode", () => {
    const result = resolveHarnessPermission(
      {
        defaultMode: "default",
        allow: ["prompt.send"],
        ask: [],
        deny: [],
      },
      "page.image.overlay",
    );

    expect(result.decision).toBe("ask");
  });

  test("uses the side-panel browser action permission mode for DOM mutations", () => {
    const baseConfig = {
      defaultMode: "default" as const,
      allow: ["prompt.send"],
      ask: [],
      deny: [],
    };

    expect(
      resolveHarnessPermission(baseConfig, "page.dom.perform", {
        browserActionsEnabled: true,
        browserActionPermissionMode: "ask",
      }).decision,
    ).toBe("ask");
    expect(
      resolveHarnessPermission(baseConfig, "page.dom.perform", {
        browserActionsEnabled: true,
        browserActionPermissionMode: "auto-review",
      }).decision,
    ).toBe("allow");
    expect(
      resolveHarnessPermission(baseConfig, "page.dom.perform", {
        browserActionsEnabled: true,
        browserActionPermissionMode: "full",
      }).decision,
    ).toBe("allow");
  });

  test("allows explicit image edit requests in default mode", () => {
    const result = resolveHarnessPermission(
      {
        defaultMode: "default",
        allow: ["prompt.send"],
        ask: [],
        deny: [],
      },
      "image.edit",
    );

    expect(result.decision).toBe("allow");
  });

  test("allows browser-permission-backed reads in default mode", () => {
    const result = resolveHarnessPermission(
      {
        defaultMode: "default",
        allow: ["prompt.send"],
        ask: [],
        deny: [],
      },
      "context.history.read",
    );

    expect(result.decision).toBe("allow");
  });

  test("allows voice start in default mode because microphone permission is handled by the browser", () => {
    const result = resolveHarnessPermission(
      {
        defaultMode: "default",
        allow: ["prompt.send"],
        ask: [],
        deny: [],
      },
      "voice.session.start",
    );

    expect(result.decision).toBe("allow");
  });

  test("blocks risky actions in plan mode", () => {
    const result = resolveHarnessPermission(
      {
        defaultMode: "plan",
        allow: [],
        ask: [],
        deny: [],
      },
      "voice.session.start",
    );

    expect(result.decision).toBe("deny");
  });

  test("blocks image edits in plan mode", () => {
    const result = resolveHarnessPermission(
      {
        defaultMode: "plan",
        allow: [],
        ask: [],
        deny: [],
      },
      "image.edit",
    );

    expect(result.decision).toBe("deny");
  });

  test("respects explicit allow rules before default policy", () => {
    const result = resolveHarnessPermission(
      {
        defaultMode: "default",
        allow: ["image.*"],
        ask: [],
        deny: [],
      },
      "image.edit",
    );

    expect(result.decision).toBe("allow");
  });
});
