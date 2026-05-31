import type {
  BridgeRealtimeTranslationPlane,
  RealtimeTranslationClientSecretParams,
  RealtimeTranslationClientSecretResult,
} from "./types.js";
import type { InMemoryBridgeSecrets } from "./secrets.js";

const REALTIME_TRANSLATION_CLIENT_SECRET_URL =
  "https://api.openai.com/v1/realtime/translations/client_secrets";
const REALTIME_TRANSLATION_MODEL = "gpt-realtime-translate";
const REALTIME_TRANSLATION_TRANSCRIPTION_MODEL = "gpt-realtime-whisper";
const DEFAULT_TARGET_LANGUAGE = "ko";
const DEFAULT_SECRET_TTL_SECONDS = 600;
const MIN_SECRET_TTL_SECONDS = 60;
const MAX_SECRET_TTL_SECONDS = 1_800;

type FetchLike = typeof fetch;

type RealtimeTranslationClientSecretResponse = {
  value?: unknown;
  expires_at?: unknown;
  session?: {
    id?: unknown;
    model?: unknown;
    audio?: {
      output?: {
        language?: unknown;
      };
    };
  };
};

export class RealtimeTranslationPlane implements BridgeRealtimeTranslationPlane {
  readonly #secrets: InMemoryBridgeSecrets;
  readonly #fetch: FetchLike;

  constructor(options: { secrets: InMemoryBridgeSecrets; fetchImpl?: FetchLike }) {
    this.#secrets = options.secrets;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async saveApiKey(params: { apiKey: string }): Promise<{ stored: true }> {
    const apiKey = params.apiKey.trim();
    if (!apiKey) {
      throw new Error("Realtime translation API key is required.");
    }
    this.#secrets.setOpenAiApiKey(apiKey);
    return { stored: true };
  }

  async clearApiKey(): Promise<{ cleared: true }> {
    this.#secrets.clearOpenAiApiKey();
    return { cleared: true };
  }

  async createClientSecret(
    params: RealtimeTranslationClientSecretParams = {},
  ): Promise<RealtimeTranslationClientSecretResult> {
    const apiKey = this.#secrets.getOpenAiApiKey();
    if (!apiKey) {
      throw new Error("Realtime interpreter requires an OpenAI API key.");
    }

    const targetLanguage = normalizeTargetLanguage(params.targetLanguage);
    const ttlSeconds = normalizeTtlSeconds(params.ttlSeconds);
    const transcriptionModel = normalizeTranscriptionModel(params.sourceTranscriptionModel);
    const response = await this.#fetch(REALTIME_TRANSLATION_CLIENT_SECRET_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: ttlSeconds,
        },
        session: {
          model: REALTIME_TRANSLATION_MODEL,
          audio: {
            input: {
              transcription: {
                model: transcriptionModel,
              },
              noise_reduction: null,
            },
            output: {
              language: targetLanguage,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(await createRealtimeTranslationHttpError(response));
    }

    const payload = (await response.json()) as RealtimeTranslationClientSecretResponse;
    const value = typeof payload.value === "string" ? payload.value : "";
    if (!value) {
      throw new Error("Realtime translation client secret response did not include a usable secret.");
    }

    return {
      value,
      expiresAt: typeof payload.expires_at === "number" ? payload.expires_at : null,
      sessionId: typeof payload.session?.id === "string" ? payload.session.id : null,
      model: REALTIME_TRANSLATION_MODEL,
      targetLanguage:
        typeof payload.session?.audio?.output?.language === "string"
          ? payload.session.audio.output.language
          : targetLanguage,
    };
  }
}

function normalizeTargetLanguage(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_TARGET_LANGUAGE;
  }
  return normalized.replace(/[^a-z-]/gu, "").slice(0, 32) || DEFAULT_TARGET_LANGUAGE;
}

function normalizeTranscriptionModel(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized || REALTIME_TRANSLATION_TRANSCRIPTION_MODEL;
}

function normalizeTtlSeconds(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SECRET_TTL_SECONDS;
  }
  return Math.min(MAX_SECRET_TTL_SECONDS, Math.max(MIN_SECRET_TTL_SECONDS, Math.floor(value)));
}

async function createRealtimeTranslationHttpError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  const detail = text.trim();
  return [
    `Realtime translation client secret request failed with ${response.status} ${response.statusText}`.trim(),
    detail,
  ]
    .filter(Boolean)
    .join(": ");
}
