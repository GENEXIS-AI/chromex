#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const bridgeEntry = process.env.CHROMEX_BRIDGE_ENTRY ?? resolve(repoRoot, "packages/bridge/dist/cli.js");
const host = process.env.CHROMEX_SAFARI_HTTP_HOST ?? "127.0.0.1";
const port = Number(process.env.CHROMEX_SAFARI_HTTP_PORT ?? "38457");
const requestTimeoutMs = Number(process.env.CHROMEX_SAFARI_HTTP_REQUEST_TIMEOUT_MS ?? "60000");

let bridge = null;
let stdoutBuffer = "";
const pending = new Map();
const queuedEvents = [];

function log(message, extra = undefined) {
  const suffix = extra === undefined ? "" : ` ${typeof extra === "string" ? extra : JSON.stringify(extra)}`;
  console.error(`[chromex-safari-http-bridge] ${new Date().toISOString()} ${message}${suffix}`);
}

function startBridge() {
  if (bridge?.exitCode === null && !bridge.killed) {
    return bridge;
  }

  bridge = spawn(process.execPath, [bridgeEntry], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      HOME: process.env.HOME ?? process.env.USERPROFILE ?? "",
      PATH: process.env.PATH ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
      CODEX_BIN: process.env.CODEX_BIN ?? "/opt/homebrew/bin/codex",
    },
  });

  log("started stdio bridge", { pid: bridge.pid, bridgeEntry });

  bridge.stdout.setEncoding("utf8");
  bridge.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    let newlineIndex;
    while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line) {
        handleBridgeLine(line);
      }
    }
  });

  bridge.stderr.setEncoding("utf8");
  bridge.stderr.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim()) {
        log("stdio stderr", line.trim());
      }
    }
  });

  bridge.on("exit", (code, signal) => {
    log("stdio bridge exited", { code, signal });
    bridge = null;
    const failures = Array.from(pending.entries());
    pending.clear();
    for (const [id, entry] of failures) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`Bridge process exited while waiting for ${id}.`));
    }
  });

  return bridge;
}

function handleBridgeLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    log("failed to parse stdio line", { line, error: error.message });
    return;
  }

  if (message?.event) {
    queuedEvents.push(message.event);
    return;
  }

  const id = typeof message?.id === "string" ? message.id : "";
  const entry = id ? pending.get(id) : undefined;
  if (!entry) {
    log("unmatched stdio response", message);
    return;
  }

  pending.delete(id);
  clearTimeout(entry.timer);
  entry.resolve(message);
}

function callBridge(request) {
  const id = typeof request?.id === "string" && request.id ? request.id : crypto.randomUUID();
  const payload = { ...request, id };
  const child = startBridge();

  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Bridge request ${payload.method ?? id} timed out.`));
    }, requestTimeoutMs);
    pending.set(id, { resolve: resolvePromise, reject, timer });
    child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
      if (!error) {
        return;
      }
      pending.delete(id);
      clearTimeout(timer);
      reject(error);
    });
  });
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    writeJson(response, 204, {});
    return;
  }

  try {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/health") {
      writeJson(response, 200, {
        ok: true,
        bridgePid: bridge?.pid ?? null,
        pending: pending.size,
        queuedEvents: queuedEvents.length,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/events") {
      const body = await readJson(request).catch(() => ({}));
      const id = typeof body.id === "string" ? body.id : crypto.randomUUID();
      const events = queuedEvents.splice(0, queuedEvents.length);
      writeJson(response, 200, { id, result: { events } });
      return;
    }

    if (request.method === "POST" && url.pathname === "/rpc") {
      const body = await readJson(request);
      const result = await callBridge(body);
      writeJson(response, 200, result);
      return;
    }

    writeJson(response, 404, { error: { message: "Not found" } });
  } catch (error) {
    log("request failed", error instanceof Error ? error.message : String(error));
    writeJson(response, 500, {
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

server.on("error", (error) => {
  log("server failed", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

server.listen(port, host, () => {
  log(`listening on http://${host}:${port}`);
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  log("shutting down");
  server.close(() => undefined);
  bridge?.kill("SIGTERM");
}
