import { afterEach, describe, expect, test, vi } from "vitest";

import { createGatewayServer } from "../src/gateway.js";
import { CoachRunnerError, type CoachRunner } from "../src/coach.js";

const servers: Array<ReturnType<typeof createGatewayServer>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  vi.restoreAllMocks();
});

describe("coach HTTP endpoint", () => {
  test("healthz checks config without running Codex", async () => {
    const runner = createFakeCoachRunner();
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      coachToken: "coach-token",
      coachRunner: runner,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const response = await fetch(`http://127.0.0.1:${port}/api/coach/healthz`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, schema_version: 1, token_configured: true });
    expect(runner.run).not.toHaveBeenCalled();
  });

  test("rejects auth failures", async () => {
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      coachToken: "coach-token",
      coachRunner: createFakeCoachRunner(),
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const missing = await postCoach(port, coachRequest(), null);
    const wrong = await postCoach(port, coachRequest(), "wrong");

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
  });

  test("chat succeeds and does not log secrets, initData, tokens, or paths", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const runner = createFakeCoachRunner();
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      coachToken: "coach-token",
      coachRunner: runner,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const response = await postCoach(port, coachRequest());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      schema_version: 1,
      answer_markdown: "Сегодня лучше держать легкий бег.",
    });
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ task: "chat", requestId: "coach-1" }),
    );
    const logs = JSON.stringify(info.mock.calls);
    expect(logs).not.toContain("coach-token");
    expect(logs).not.toContain("initData");
    expect(logs).not.toContain("secret-file");
    expect(logs).not.toContain("/Users/");
  });

  test("week-proposal succeeds", async () => {
    const runner = createFakeCoachRunner();
    runner.run = vi.fn(async () => fakeCoachResult({ answer_markdown: "Черновик недели подготовлен." }));
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      coachToken: "coach-token",
      coachRunner: runner,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const response = await postCoach(port, coachRequest({ path: "/api/coach/week-proposal" }));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      schema_version: 1,
      answer_markdown: "Черновик недели подготовлен.",
    });
  });

  test("schema validation failure is rejected", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runner = createFakeCoachRunner();
    runner.run = vi.fn(async () => ({
      schemaVersion: 2,
      response: { schema_version: 2, answer_markdown: "bad", suggested_actions: [], create_week_proposal: false },
      model: "fake",
      provider: "codex_gateway",
    }));
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      coachToken: "coach-token",
      coachRunner: runner,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const response = await postCoach(port, coachRequest());

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ ok: false, error: { code: "SCHEMA_VERSION_MISMATCH" } });
  });

  test("timeout and busy behavior are deterministic", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let release!: () => void;
    const firstRun = new Promise<CoachRunnerError>((resolve) => {
      release = () => resolve(new CoachRunnerError("CODEX_TIMEOUT", "timeout"));
    });
    const runner = createFakeCoachRunner();
    runner.run = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw await firstRun;
      })
      .mockImplementationOnce(async () => fakeCoachResult());
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      coachToken: "coach-token",
      coachRunner: runner,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const first = postCoach(port, coachRequest());
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledTimes(1));
    const second = await postCoach(port, coachRequest({ requestId: "coach-2" }));
    release();
    const firstResponse = await first;
    const third = await postCoach(port, coachRequest({ requestId: "coach-3" }));

    expect(second).toMatchObject({ status: 429, body: { error: { code: "COACH_BUSY" } } });
    expect(firstResponse).toMatchObject({ status: 504, body: { error: { code: "CODEX_TIMEOUT" } } });
    expect(third).toMatchObject({ status: 200, body: { ok: true } });
  });

  test("raw secrets and file paths in context are rejected before runner", async () => {
    const runner = createFakeCoachRunner();
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      coachToken: "coach-token",
      coachRunner: runner,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const response = await postCoach(
      port,
      coachRequest({ context: { profile: {}, token: "secret", path: "/Users/fedor/secret-file.png" } }),
    );

    expect(response.status).toBe(400);
    expect(runner.run).not.toHaveBeenCalled();
  });
});

function createFakeCoachRunner(): CoachRunner & { run: ReturnType<typeof vi.fn> } {
  return {
    describe: () => ({ type: "fake" }),
    run: vi.fn(async () => fakeCoachResult()),
  };
}

function fakeCoachResult(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    model: "fake-codex",
    provider: "codex_gateway",
    reasoningProfile: "max",
    response: {
      schema_version: 1,
      answer_markdown: "Сегодня лучше держать легкий бег.",
      suggested_actions: ["Можно легче?"],
      create_week_proposal: false,
      ...overrides,
    },
  };
}

function coachRequest(options: {
  requestId?: string;
  path?: string;
  context?: Record<string, unknown>;
} = {}) {
  return {
    path: options.path ?? "/api/coach/chat",
    request_id: options.requestId ?? "coach-1",
    message: "Почему сегодня такая тренировка?",
    context: options.context ?? {
      profile: { timezone: "Asia/Jerusalem" },
      today: "2026-05-03",
      visible_week: { workouts: 7 },
    },
    thread_summary: [],
    selected_upload_ids: [1],
  };
}

async function postCoach(
  port: number,
  body: ReturnType<typeof coachRequest>,
  token: string | null = "coach-token",
) {
  const { path, ...payload } = body;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

function createFakeRuntime() {
  return {
    router: {
      handle: vi.fn(async (request) => ({ id: request.id, result: {} })),
    },
    setEventSink: vi.fn(),
    shutdown: vi.fn(async () => undefined),
  };
}
