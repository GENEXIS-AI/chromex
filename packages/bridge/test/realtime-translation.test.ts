import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test, vi } from "vitest";

import { InMemoryBridgeSecrets, RealtimeTranslationPlane } from "../src/index.js";

function testSecretPath(name: string): string {
  const path = join(process.cwd(), `tmp-realtime-translation-${name}.json`);
  rmSync(path, { force: true });
  return path;
}

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
      secrets: new InMemoryBridgeSecrets({
        secretPath: testSecretPath("create"),
        initialOpenAiApiKey: "sk-test",
      }),
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
          "OpenAI-Safety-Identifier": expect.stringMatching(/^chromex-[a-f0-9]{64}$/u),
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
      secrets: new InMemoryBridgeSecrets({
        secretPath: testSecretPath("empty"),
        initialOpenAiApiKey: null,
      }),
      fetchImpl: vi.fn(),
    });

    await expect(plane.createClientSecret({ targetLanguage: "ko" })).rejects.toThrow(/API key/u);
  });

  test("clears the stored OpenAI API key used for realtime translation", async () => {
    const secretPath = testSecretPath("clear");
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ value: "ek_test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const plane = new RealtimeTranslationPlane({
      secrets: new InMemoryBridgeSecrets({
        secretPath,
        initialOpenAiApiKey: "sk-test",
      }),
      fetchImpl,
    });

    await expect(plane.createClientSecret({ targetLanguage: "ko" })).resolves.toMatchObject({ value: "ek_test" });
    expect(existsSync(secretPath)).toBe(true);
    await expect(plane.clearApiKey()).resolves.toEqual({ cleared: true });
    expect(existsSync(secretPath)).toBe(false);
    await expect(plane.createClientSecret({ targetLanguage: "ko" })).rejects.toThrow(/API key/u);
  });
});
