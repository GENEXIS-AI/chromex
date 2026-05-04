import { createHash, timingSafeEqual } from "node:crypto";
import http, { type IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  createBridgeRuntime,
  type BridgeEvent,
  type BridgeRequest,
  type BridgeResponse,
} from "@codex-sidepanel/bridge";

import { createCoachHttpHandler, type CoachRunner } from "./coach.js";
import { createVisionHttpHandler, type VisionRunner } from "./vision.js";

type GatewayJson = {
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

type GatewayRequest = {
  id: string;
  method: string;
  params: Record<string, unknown>;
};

export type GatewayRouter = {
  handle(request: BridgeRequest, options?: { emit?: (event: BridgeEvent) => void }): Promise<BridgeResponse>;
};

export type GatewayRuntime = {
  router: GatewayRouter;
  setEventSink(sink: (event: BridgeEvent) => void): void;
  shutdown(): Promise<void>;
};

export type GatewayServerOptions = {
  token: string;
  runtime?: GatewayRuntime;
  host?: string;
  port?: number;
  authTimeoutMs?: number;
  rateLimitWindowMs?: number;
  maxAuthFailuresPerWindow?: number;
  visionToken?: string;
  visionRunner?: VisionRunner;
  coachToken?: string;
  coachRunner?: CoachRunner;
};

export type GatewayServer = {
  server: http.Server;
  runtime: GatewayRuntime;
  listen(): Promise<{ port: number }>;
  close(): Promise<void>;
};

const DEFAULT_AUTH_TIMEOUT_MS = 5000;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_MAX_AUTH_FAILURES = 10;
const SUPPORTED_PROTOCOL_VERSION = 1;

export function createGatewayServer(options: GatewayServerOptions): GatewayServer {
  if (!options.token.trim()) {
    throw new Error("CHROMEX_GATEWAY_TOKEN is required.");
  }

  const runtime = options.runtime ?? createBridgeRuntime();
  const tokenHash = sha256(options.token);
  const authFailuresByIp = new Map<string, { count: number; resetAt: number }>();
  const handleVisionHttp = createVisionHttpHandler({
    ...(options.visionToken !== undefined ? { token: options.visionToken } : {}),
    ...(options.visionRunner ? { runner: options.visionRunner } : {}),
  });
  const handleCoachHttp = createCoachHttpHandler({
    ...(options.coachToken !== undefined ? { token: options.coachToken } : {}),
    ...(options.coachRunner ? { runner: options.coachRunner } : {}),
  });
  const server = http.createServer((request, response) => {
    void handleHttpRequest(request, response).catch((error) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    });
  });
  const websocketServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname !== "/rpc") {
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request);
    });
  });

  websocketServer.on("connection", (websocket, request) => {
    const clientIp = getClientIp(request);
    let authenticated = false;
    const authTimer = setTimeout(() => {
      if (!authenticated) {
        console.warn("Gateway authentication timed out.", { clientIp });
        websocket.close(1008, "authentication required");
      }
    }, options.authTimeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS);

    websocket.on("message", (data) => {
      void handleMessage(websocket, data.toString(), {
        clientIp,
        authenticated,
        markAuthenticated: () => {
          authenticated = true;
          clearTimeout(authTimer);
          runtime.setEventSink((event) => sendJson(websocket, { event }));
        },
      }).catch((error) => {
        sendJson(websocket, {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      });
    });

    websocket.on("close", () => {
      clearTimeout(authTimer);
    });
  });

  async function handleMessage(
    websocket: WebSocket,
    raw: string,
    state: {
      clientIp: string;
      authenticated: boolean;
      markAuthenticated: () => void;
    },
  ): Promise<void> {
    const message = parseGatewayRequest(raw);
    if (!message) {
      websocket.close(1003, "invalid json");
      return;
    }

    if (!state.authenticated) {
      if (message.method !== "gateway.auth") {
        sendJson(websocket, { id: message.id, error: { message: "Authenticate before sending RPC." } });
        websocket.close(1008, "authentication required");
        return;
      }
      if (isRateLimited(state.clientIp)) {
        console.warn("Gateway authentication rate limited.", { clientIp: state.clientIp });
        sendJson(websocket, { id: message.id, error: { message: "Too many authentication failures." } });
        websocket.close(1008, "rate limited");
        return;
      }
      if (!isValidAuth(message, tokenHash)) {
        recordAuthFailure(state.clientIp);
        console.warn("Gateway authentication failed.", { clientIp: state.clientIp });
        sendJson(websocket, { id: message.id, error: { message: "Invalid gateway token." } });
        websocket.close(1008, "invalid token");
        return;
      }
      state.markAuthenticated();
      sendJson(websocket, { id: message.id, result: { ok: true } });
      return;
    }

    if (message.method === "gateway.ping") {
      sendJson(websocket, { id: message.id, result: { type: "gateway.pong", now: Date.now() } });
      return;
    }

    const response = await runtime.router.handle(message, {
      emit: (event) => sendJson(websocket, { event }),
    });
    sendJson(websocket, response);
  }

  function isRateLimited(clientIp: string): boolean {
    const entry = authFailuresByIp.get(clientIp);
    if (!entry || Date.now() > entry.resetAt) {
      return false;
    }
    return entry.count >= (options.maxAuthFailuresPerWindow ?? DEFAULT_MAX_AUTH_FAILURES);
  }

  function recordAuthFailure(clientIp: string): void {
    const now = Date.now();
    const current = authFailuresByIp.get(clientIp);
    if (!current || now > current.resetAt) {
      authFailuresByIp.set(clientIp, {
        count: 1,
        resetAt: now + (options.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS),
      });
      return;
    }
    current.count += 1;
  }

  async function handleHttpRequest(
    request: IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    if (await handleVisionHttp(request, response)) {
      return;
    }
    if (await handleCoachHttp(request, response)) {
      return;
    }
    if (request.url === "/healthz" || request.url === "/readyz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  }

  return {
    server,
    runtime,
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => {
          server.off("error", reject);
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("Gateway server did not bind to a TCP port."));
            return;
          }
          resolve({ port: address.port });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        websocketServer.close();
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          runtime.shutdown().then(resolve, reject);
        });
      });
    },
  };
}

function parseGatewayRequest(raw: string): GatewayRequest | null {
  let parsed: GatewayJson;
  try {
    parsed = JSON.parse(raw) as GatewayJson;
  } catch {
    return null;
  }
  if (typeof parsed.id !== "string" || typeof parsed.method !== "string") {
    return null;
  }
  return {
    id: parsed.id,
    method: parsed.method,
    params: isRecord(parsed.params) ? parsed.params : {},
  };
}

function isValidAuth(request: GatewayRequest, expectedTokenHash: Buffer): boolean {
  const token = typeof request.params.token === "string" ? request.params.token : "";
  const protocolVersion = request.params.protocolVersion;
  if (protocolVersion !== SUPPORTED_PROTOCOL_VERSION) {
    return false;
  }
  const actualTokenHash = sha256(token);
  return actualTokenHash.length === expectedTokenHash.length && timingSafeEqual(actualTokenHash, expectedTokenHash);
}

function sendJson(websocket: WebSocket, payload: BridgeResponse | Record<string, unknown>): void {
  if (websocket.readyState !== WebSocket.OPEN) {
    return;
  }
  websocket.send(JSON.stringify(payload));
}

function getClientIp(request: IncomingMessage): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return request.socket.remoteAddress ?? "unknown";
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
