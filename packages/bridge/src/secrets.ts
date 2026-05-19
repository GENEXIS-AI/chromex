import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { resolveDefaultSecretStorePath } from "./platform.js";

type BridgeSecretFilePayload = {
  openAiApiKey?: string;
  localSafetyId?: string;
};

function readPersistedSecrets(secretPath: string): BridgeSecretFilePayload {
  if (!existsSync(secretPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(secretPath, "utf8")) as BridgeSecretFilePayload;
    return {
      ...(typeof parsed.openAiApiKey === "string" ? { openAiApiKey: parsed.openAiApiKey } : {}),
      ...(typeof parsed.localSafetyId === "string" ? { localSafetyId: parsed.localSafetyId } : {}),
    };
  } catch {
    return {};
  }
}

export class InMemoryBridgeSecrets {
  readonly #secretPath: string;
  #openAiApiKey: string | null = null;
  #localSafetyId: string | null = null;

  constructor(options?: { secretPath?: string; initialOpenAiApiKey?: string | null }) {
    this.#secretPath = options?.secretPath ?? resolveDefaultSecretStorePath();
    const persisted = readPersistedSecrets(this.#secretPath);
    const hasExplicitInitialKey = Boolean(options && "initialOpenAiApiKey" in options);
    this.#openAiApiKey = hasExplicitInitialKey
      ? options?.initialOpenAiApiKey ?? null
      : persisted.openAiApiKey ?? null;
    this.#localSafetyId = persisted.localSafetyId ?? null;
  }

  setOpenAiApiKey(apiKey: string): void {
    this.#openAiApiKey = apiKey;
    this.#persist();
  }

  getOpenAiApiKey(): string | undefined {
    return this.#openAiApiKey ?? undefined;
  }

  clearOpenAiApiKey(): void {
    this.#openAiApiKey = null;
    this.#localSafetyId = null;
    this.#persist();
  }

  hasOpenAiApiKey(): boolean {
    return Boolean(this.#openAiApiKey);
  }

  getOpenAiSafetyIdentifier(): string {
    if (!this.#localSafetyId) {
      this.#localSafetyId = randomUUID();
      this.#persist();
    }
    return `chromex-${createHash("sha256").update(this.#localSafetyId).digest("hex")}`;
  }

  getSecretPath(): string {
    return this.#secretPath;
  }

  #persist(): void {
    if (!this.#openAiApiKey && !this.#localSafetyId) {
      this.#clearPersisted();
      return;
    }

    mkdirSync(dirname(this.#secretPath), { recursive: true });
    writeFileSync(
      this.#secretPath,
      JSON.stringify(
        {
          ...(this.#openAiApiKey ? { openAiApiKey: this.#openAiApiKey } : {}),
          ...(this.#localSafetyId ? { localSafetyId: this.#localSafetyId } : {}),
        },
        null,
        2,
      ),
      { encoding: "utf8", mode: 0o600 },
    );
    try {
      chmodSync(this.#secretPath, 0o600);
    } catch {
      // Windows and managed filesystems may not support POSIX modes. Keep the per-user location and continue.
    }
  }

  #clearPersisted(): void {
    if (!existsSync(this.#secretPath)) {
      return;
    }

    rmSync(this.#secretPath, { force: true });
  }
}
