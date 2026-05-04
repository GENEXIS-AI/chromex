import { afterEach, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";

import { createGatewayServer, type GatewayRuntime } from "../src/gateway.js";

const servers: Array<ReturnType<typeof createGatewayServer>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  vi.restoreAllMocks();
});

describe("gateway server", () => {
  test("proxies RPC after gateway auth", async () => {
    const runtime = createFakeRuntime();
    const gateway = createGatewayServer({ token: "test-token", runtime });
    servers.push(gateway);
    const { port } = await gateway.listen();
    const websocket = await connect(port);

    websocket.send(JSON.stringify(authMessage("test-token")));
    await expect(readJson(websocket)).resolves.toMatchObject({ id: "auth-1", result: { ok: true } });

    websocket.send(JSON.stringify({ id: "rpc-1", method: "account.status", params: {} }));
    await expect(readJson(websocket)).resolves.toMatchObject({
      id: "rpc-1",
      result: { ok: true, method: "account.status" },
    });
    expect(runtime.router.handle).toHaveBeenCalledTimes(1);

    websocket.close();
  });

  test("rejects RPC before auth", async () => {
    const runtime = createFakeRuntime();
    const gateway = createGatewayServer({ token: "test-token", runtime });
    servers.push(gateway);
    const { port } = await gateway.listen();
    const websocket = await connect(port);

    websocket.send(JSON.stringify({ id: "rpc-1", method: "account.status", params: {} }));
    await expect(readJson(websocket)).resolves.toMatchObject({
      id: "rpc-1",
      error: { message: "Authenticate before sending RPC." },
    });
    await expect(waitForClose(websocket)).resolves.toBe(1008);
    expect(runtime.router.handle).not.toHaveBeenCalled();
  });

  test("closes unauthenticated sockets after auth timeout", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const gateway = createGatewayServer({
      token: "test-token",
      runtime: createFakeRuntime(),
      authTimeoutMs: 20,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();
    const websocket = await connect(port);

    await expect(waitForClose(websocket)).resolves.toBe(1008);
  });

  test("rejects invalid tokens without leaking tokens or executing RPC", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtime = createFakeRuntime();
    const gateway = createGatewayServer({
      token: "test-token",
      runtime,
      maxAuthFailuresPerWindow: 1,
      rateLimitWindowMs: 60_000,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();
    const websocket = await connect(port);

    websocket.send(JSON.stringify(authMessage("wrong-token")));
    await expect(readJson(websocket)).resolves.toMatchObject({
      id: "auth-1",
      error: { message: "Invalid gateway token." },
    });
    await expect(waitForClose(websocket)).resolves.toBe(1008);
    expect(runtime.router.handle).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("wrong-token");
  });

  test("rate-limits repeated authentication failures by IP", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtime = createFakeRuntime();
    const gateway = createGatewayServer({
      token: "test-token",
      runtime,
      maxAuthFailuresPerWindow: 1,
      rateLimitWindowMs: 60_000,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();
    const first = await connect(port);

    first.send(JSON.stringify(authMessage("wrong-token")));
    await readJson(first);
    await waitForClose(first);

    const second = await connect(port);
    second.send(JSON.stringify(authMessage("test-token")));
    await expect(readJson(second)).resolves.toMatchObject({
      id: "auth-1",
      error: { message: "Too many authentication failures." },
    });
    await expect(waitForClose(second)).resolves.toBe(1008);
    expect(runtime.router.handle).not.toHaveBeenCalled();
  });

  test("answers heartbeat pings after auth", async () => {
    const gateway = createGatewayServer({ token: "test-token", runtime: createFakeRuntime() });
    servers.push(gateway);
    const { port } = await gateway.listen();
    const websocket = await connect(port);

    websocket.send(JSON.stringify(authMessage("test-token")));
    await readJson(websocket);
    websocket.send(JSON.stringify({ id: "ping-1", method: "gateway.ping", params: {} }));

    await expect(readJson(websocket)).resolves.toMatchObject({
      id: "ping-1",
      result: { type: "gateway.pong" },
    });

    websocket.close();
  });
});

function createFakeRuntime(): GatewayRuntime {
  return {
    router: {
      handle: vi.fn(async (request) => {
        return {
          id: request.id,
          result: {
            ok: true,
            method: request.method,
          },
        };
      }),
    },
    setEventSink: vi.fn(),
    shutdown: vi.fn(async () => undefined),
  };
}

function authMessage(token: string) {
  return {
    id: "auth-1",
    method: "gateway.auth",
    params: {
      token,
      clientId: "test-client",
      protocolVersion: 1,
    },
  };
}

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const websocket = new WebSocket(`ws://127.0.0.1:${port}/rpc`);
    websocket.once("open", () => resolve(websocket));
    websocket.once("error", reject);
  });
}

function readJson(websocket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    websocket.once("message", (data) => {
      try {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    websocket.once("error", reject);
  });
}

function waitForClose(websocket: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    websocket.once("close", (code) => resolve(code));
  });
}
