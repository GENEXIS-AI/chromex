import { describe, expect, test } from "vitest";

import { classifyRuntimeMessageError, isRetryableRuntimeMessageError } from "../src/runtime-errors.js";

describe("runtime message error helpers", () => {
  test("classifies closed message channels as transient disconnects", () => {
    const error = new Error(
      "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received",
    );

    expect(classifyRuntimeMessageError(error)).toBe("transient-disconnect");
    expect(isRetryableRuntimeMessageError(error)).toBe(true);
  });

  test("classifies missing receivers as transient disconnects", () => {
    const error = new Error("Could not establish connection. Receiving end does not exist.");

    expect(classifyRuntimeMessageError(error)).toBe("transient-disconnect");
    expect(isRetryableRuntimeMessageError(error)).toBe(true);
  });

  test("classifies removed frames during tab navigation as transient disconnects", () => {
    const error = new Error("Frame with ID 0 was removed.");

    expect(classifyRuntimeMessageError(error)).toBe("transient-disconnect");
    expect(isRetryableRuntimeMessageError(error)).toBe(true);
  });

  test("classifies friendly lost-tab messages as transient disconnects", () => {
    const error = new Error("Codex temporarily lost its connection to this tab. Try the action once more.");

    expect(classifyRuntimeMessageError(error)).toBe("transient-disconnect");
    expect(isRetryableRuntimeMessageError(error)).toBe(true);
  });

  test("classifies stale tab ids as stale tab disconnects", () => {
    const error = new Error("No tab with id: 355471561");

    expect(classifyRuntimeMessageError(error)).toBe("stale-tab");
    expect(isRetryableRuntimeMessageError(error)).toBe(true);
  });

  test("classifies missing bundled content script files separately", () => {
    const error = new Error("Could not load file: 'content.js'.");

    expect(classifyRuntimeMessageError(error)).toBe("extension-reload-required");
    expect(isRetryableRuntimeMessageError(error)).toBe(false);
  });

  test("classifies raw host-access failures separately", () => {
    const error = new Error(
      "Cannot access contents of url \"https://x.com/home\". Extension manifest must request permission to access this host.",
    );

    expect(classifyRuntimeMessageError(error)).toBe("host-access");
    expect(isRetryableRuntimeMessageError(error)).toBe(false);
  });

  test("classifies expired Codex OAuth sessions separately", () => {
    const error = new Error(
      "Your access token could not be refreshed because you have since logged out or signed in to another account. Please sign in again.",
    );

    expect(classifyRuntimeMessageError(error)).toBe("auth-expired");
    expect(isRetryableRuntimeMessageError(error)).toBe(false);
  });

  test("classifies invalid API keys without exposing the key as an unknown error", () => {
    const error = new Error(
      "unexpected status 401 Unauthorized: Incorrect API key provided: sk-proj-abc123, auth error code: invalid_api_key",
    );

    expect(classifyRuntimeMessageError(error)).toBe("invalid-api-key");
    expect(isRetryableRuntimeMessageError(error)).toBe(false);
  });

  test("classifies usage limits and invalid image payloads as expected request failures", () => {
    expect(classifyRuntimeMessageError(new Error("You've hit your usage limit. Try again later."))).toBe(
      "usage-limit",
    );
    expect(classifyRuntimeMessageError(new Error("Invalid image in your last message. Please remove it and try again."))).toBe(
      "invalid-image",
    );
  });

  test("classifies missing Codex configuration separately", () => {
    const error = new Error("failed to load configuration: No such file or directory (os error 2)");

    expect(classifyRuntimeMessageError(error)).toBe("missing-configuration");
    expect(isRetryableRuntimeMessageError(error)).toBe(false);
  });

  test("leaves unknown failures untouched", () => {
    const error = new Error("server overloaded");

    expect(classifyRuntimeMessageError(error)).toBe("unknown");
    expect(isRetryableRuntimeMessageError(error)).toBe(false);
  });
});
