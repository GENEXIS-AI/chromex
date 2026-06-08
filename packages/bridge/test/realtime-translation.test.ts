import { describe, expect, test, vi } from "vitest";

import { InMemoryBridgeSecrets, RealtimeTranslationPlane } from "../src/index.js";

describe("RealtimeTranslationPlane", () => {
  test("creates short-lived browser secrets for gpt-realtime-translate", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => {
      return new Response(
        JSON.stringify({
          value: "ek_test",
          expires_at: 1_700_000_600,
          session: { id: "sess_test", type: "translation", model: "gpt-realtime-translate" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const plane = new RealtimeTranslationPlane({
      secrets: new InMemoryBridgeSecrets({ secretPath: "/tmp/chromex-test-secrets.json", initialOpenAiApiKey: "sk-test" }),
      fetchImpl,
    });

    const result = await plane.createClientSecret({ targetLanguage: "ko", ttlSeconds: 300 });

    expect(result).toMatchObject({
      value: "ek_test",
      expiresAt: 1_700_000_600,
      model: "gpt-realtime-translate",
      targetLanguage: "ko",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/translations/client_secrets",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
          "Content-Type": "application/json",
        }),
        body: expect.stringContaining('"model":"gpt-realtime-translate"'),
      }),
    );
    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      expires_after: { anchor: "created_at", seconds: 300 },
      session: {
        model: "gpt-realtime-translate",
        audio: {
          input: {
            transcription: { model: "gpt-realtime-whisper" },
            noise_reduction: null,
          },
          output: { language: "ko" },
        },
      },
    });
  });

  test("does not create translation secrets unless an OpenAI API key is configured", async () => {
    const plane = new RealtimeTranslationPlane({
      secrets: new InMemoryBridgeSecrets({ secretPath: "/tmp/chromex-test-empty-secrets.json", initialOpenAiApiKey: null }),
      fetchImpl: vi.fn(),
    });

    await expect(plane.createClientSecret({ targetLanguage: "ko" })).rejects.toThrow(/API key/u);
  });

  test("clears the stored OpenAI API key used for realtime translation", async () => {
    const plane = new RealtimeTranslationPlane({
      secrets: new InMemoryBridgeSecrets({ secretPath: "/tmp/chromex-test-clear-secrets.json", initialOpenAiApiKey: "sk-test" }),
      fetchImpl: vi.fn(),
    });

    await expect(plane.clearApiKey()).resolves.toEqual({ cleared: true });
    await expect(plane.createClientSecret({ targetLanguage: "ko" })).rejects.toThrow(/API key/u);
  });
});
