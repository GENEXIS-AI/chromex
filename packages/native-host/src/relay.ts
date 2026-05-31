import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import readline from "node:readline";

import { NativeMessageStreamDecoder, encodeNativeMessage } from "./framing.js";
import { createBridgeProcessEnv, mergeShellProviderEnv } from "./environment.js";

export class NativeHostRelay {
  readonly #decoder = new NativeMessageStreamDecoder();
  #bridge?: ChildProcessByStdio<Writable, Readable, null>;
  #shuttingDown = false;

  start(): void {
    const bridgeBaseEnv = mergeShellProviderEnv(process.env);
    this.#bridge = spawn(process.execPath, [this.#resolveBridgeEntry()], {
      stdio: ["pipe", "pipe", "inherit"],
      env: createBridgeProcessEnv(bridgeBaseEnv),
    });
    this.#bridge.stdin.on("error", (error) => {
      if (this.#handleOutputError(error)) {
        return;
      }
      throw error;
    });
    this.#bridge.on("exit", () => {
      this.#shutdown();
    });
    process.stdout.on("error", (error) => {
      if (this.#handleOutputError(error)) {
        return;
      }
      throw error;
    });
    process.stdin.on("end", () => {
      this.#shutdown();
    });
    process.on("SIGTERM", () => {
      this.#shutdown();
    });
    process.on("SIGINT", () => {
      this.#shutdown();
    });

    process.stdin.on("data", (chunk: Buffer) => {
      const messages = this.#decoder.push(chunk);
      for (const message of messages) {
        if (!this.#writeToBridge(`${JSON.stringify(message)}\n`)) {
          return;
        }
      }
    });

    const lineReader = readline.createInterface({
      input: this.#bridge.stdout,
    });
    lineReader.on("line", (line) => {
      if (!line.trim()) {
        return;
      }

      this.#writeToStdout(encodeNativeMessage(JSON.parse(line)));
    });
  }

  #writeToBridge(payload: string): boolean {
    try {
      this.#bridge?.stdin?.write(payload);
      return true;
    } catch (error) {
      if (this.#handleOutputError(error)) {
        return false;
      }
      throw error;
    }
  }

  #writeToStdout(payload: Buffer): boolean {
    try {
      process.stdout.write(payload);
      return true;
    } catch (error) {
      if (this.#handleOutputError(error)) {
        return false;
      }
      throw error;
    }
  }

  #handleOutputError(error: unknown): boolean {
    if (!isBrokenPipeError(error)) {
      return false;
    }

    this.#shutdown();
    return true;
  }

  #shutdown(): void {
    if (this.#shuttingDown) {
      return;
    }

    this.#shuttingDown = true;
    this.#bridge?.kill();
    process.exit(0);
  }

  #resolveBridgeEntry(): string {
    const configuredBridgeEntry = normalizeNativeHostPath(process.env.BRIDGE_ENTRY ?? "");
    if (configuredBridgeEntry) {
      return configuredBridgeEntry;
    }

    const currentDir = dirname(fileURLToPath(import.meta.url));
    return resolve(currentDir, "../../bridge/dist/cli.js");
  }
}

export function normalizeNativeHostPath(value: string): string {
  let normalized = value.trim();
  while (
    normalized.length >= 2 &&
    ((normalized.startsWith("\"") && normalized.endsWith("\"")) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function isBrokenPipeError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: string }).code === "EPIPE" || (error as { code?: string }).code === "ERR_STREAM_DESTROYED")
  );
}
