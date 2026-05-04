import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createGatewayServer } from "../src/gateway.js";
import { CodexVisionRunner, VisionRunnerError, type VisionRunner } from "../src/vision.js";

const servers: Array<ReturnType<typeof createGatewayServer>> = [];
const tinyPng = Buffer.from("fake png bytes").toString("base64");

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  vi.restoreAllMocks();
});

describe("vision HTTP endpoint", () => {
  test("healthz checks config without running Codex", async () => {
    const runner = createFakeRunner();
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      visionToken: "vision-token",
      visionRunner: runner,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const response = await fetch(`http://127.0.0.1:${port}/api/vision/healthz`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, schema_version: 1, token_configured: true });
    expect(runner.run).not.toHaveBeenCalled();
  });

  test("extracts with fake runner and does not log sensitive payloads", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const runner = createFakeRunner();
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      visionToken: "vision-token",
      visionRunner: runner,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const response = await fetch(`http://127.0.0.1:${port}/api/vision/health-snapshot`, {
      method: "POST",
      headers: {
        authorization: "Bearer vision-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(visionRequest({ base64: tinyPng })),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      schema_version: 1,
      extraction: { source: "garmin" },
    });
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        filename: "garmin.png",
        mimeType: "image/png",
      }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("vision-token");
    expect(JSON.stringify(info.mock.calls)).not.toContain(tinyPng);
    expect(JSON.stringify(info.mock.calls)).not.toContain("body_battery");
  });

  test("classifies food photos with fake runner and does not log sensitive payloads", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const runner = createFakeRunner();
    runner.run = vi.fn(async () => fakeFoodResult());
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      visionToken: "vision-token",
      visionRunner: runner,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const response = await fetch(`http://127.0.0.1:${port}/api/vision/food-photo`, {
      method: "POST",
      headers: {
        authorization: "Bearer vision-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(visionRequest({ filename: "meal.jpg", mimeType: "image/jpeg", base64: tinyPng })),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      schema_version: 1,
      classification: {
        protein_present: "yes",
        carbs_after_workout: "yes",
        confidence: "medium",
      },
    });
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "food-photo",
        requestId: "req-1",
        filename: "meal.jpg",
        mimeType: "image/jpeg",
      }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("vision-token");
    expect(JSON.stringify(info.mock.calls)).not.toContain(tinyPng);
    expect(JSON.stringify(info.mock.calls)).not.toContain("balanced meal");
  });

  test("rejects forbidden food classification text before responding", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runner = createFakeRunner();
    runner.run = vi.fn(async () => ({
      ...fakeFoodResult(),
      classification: {
        ...fakeFoodResult().classification,
        note: "This looks like about 600 calories.",
      },
    }));
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      visionToken: "vision-token",
      visionRunner: runner,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const response = await fetch(`http://127.0.0.1:${port}/api/vision/food-photo`, {
      method: "POST",
      headers: {
        authorization: "Bearer vision-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(visionRequest({ base64: tinyPng })),
    });
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      ok: false,
      schema_version: 1,
      error: { code: "FOOD_FORBIDDEN_CONTENT" },
    });
  });

  test("rejects missing and wrong tokens", async () => {
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      visionToken: "vision-token",
      visionRunner: createFakeRunner(),
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const missing = await fetch(`http://127.0.0.1:${port}/api/vision/health-snapshot`, {
      method: "POST",
      body: JSON.stringify(visionRequest({ base64: tinyPng })),
    });
    const wrong = await fetch(`http://127.0.0.1:${port}/api/vision/health-snapshot`, {
      method: "POST",
      headers: { authorization: "Bearer wrong-token" },
      body: JSON.stringify(visionRequest({ base64: tinyPng })),
    });

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
  });

  test("rejects unsupported MIME, invalid base64, and oversized images", async () => {
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      visionToken: "vision-token",
      visionRunner: createFakeRunner(),
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    await expect(postVision(port, visionRequest({ mimeType: "application/pdf", base64: tinyPng }))).resolves.toMatchObject({
      status: 400,
      body: { ok: false, error: { code: "UNSUPPORTED_MIME_TYPE" } },
    });
    await expect(postVision(port, visionRequest({ base64: "!!!" }))).resolves.toMatchObject({
      status: 400,
      body: { ok: false, error: { code: "INVALID_BASE64" } },
    });
    await expect(
      postVision(port, visionRequest({ base64: Buffer.alloc(8 * 1024 * 1024 + 1).toString("base64") })),
    ).resolves.toMatchObject({
      status: 400,
      body: { ok: false, error: { code: "IMAGE_TOO_LARGE" } },
    });
  });

  test("returns deterministic busy response for concurrent requests and releases lock after failure", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let release!: () => void;
    const firstRun = new Promise<VisionRunnerError>((resolve) => {
      release = () => resolve(new VisionRunnerError("CODEX_TIMEOUT", "timeout"));
    });
    const runner = createFakeRunner();
    runner.run = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw await firstRun;
      })
      .mockImplementationOnce(async () => fakeVisionResult());
    const gateway = createGatewayServer({
      token: "rpc-token",
      runtime: createFakeRuntime(),
      visionToken: "vision-token",
      visionRunner: runner,
    });
    servers.push(gateway);
    const { port } = await gateway.listen();

    const first = postVision(port, visionRequest({ base64: tinyPng }));
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledTimes(1));
    const second = await postVision(port, visionRequest({ requestId: "req-2", base64: tinyPng }));
    release();
    const firstResponse = await first;
    const third = await postVision(port, visionRequest({ requestId: "req-3", base64: tinyPng }));

    expect(second).toMatchObject({ status: 429, body: { error: { code: "VISION_BUSY" } } });
    expect(firstResponse).toMatchObject({ status: 502, body: { error: { code: "CODEX_TIMEOUT" } } });
    expect(third).toMatchObject({ status: 200, body: { ok: true } });
  });
});

describe("CodexVisionRunner", () => {
  test("passes prompt on stdin and uses a minimal subprocess env", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "vision-runner-test-"));
    const capturePath = join(tempRoot, "capture.json");
    const command = await writeFakeCodexCommand(tempRoot, "capture-invocation", capturePath);
    const runner = new CodexVisionRunner({
      codexCommand: command,
      codexHome: tempRoot,
      healthSchemaPath: join(tempRoot, "schema.json"),
      foodSchemaPath: join(tempRoot, "food-schema.json"),
      tempRoot: join(tempRoot, "tmp"),
      timeoutMs: 5_000,
    });
    await writeFile(join(tempRoot, "schema.json"), "{}");
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    const previousGatewayToken = process.env.CHROMEX_GATEWAY_TOKEN;
    process.env.OPENAI_API_KEY = "must-not-leak";
    process.env.CHROMEX_GATEWAY_TOKEN = "must-not-leak";

    try {
      await runner.run({
        requestId: "req-capture",
        filename: "garmin.png",
        mimeType: "image/png",
        imageBytes: Buffer.from("image"),
        context: { upload_date: "2026-05-01T07:40:00+03:00" },
      });
    } finally {
      if (previousOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      }
      if (previousGatewayToken === undefined) {
        delete process.env.CHROMEX_GATEWAY_TOKEN;
      } else {
        process.env.CHROMEX_GATEWAY_TOKEN = previousGatewayToken;
      }
    }

    const capture = JSON.parse(await readFile(capturePath, "utf-8")) as {
      argv: string[];
      stdin: string;
      env: Record<string, string | undefined>;
    };
    expect(capture.argv).toEqual(
      expect.arrayContaining(["--ask-for-approval", "never", "exec", "--sandbox", "read-only", "-C", "-"]),
    );
    expect(capture.argv.join("\n")).not.toContain("Dynamic context JSON");
    expect(capture.stdin).toContain("Dynamic context JSON");
    expect(capture.env.CODEX_HOME).toBe(tempRoot);
    expect(capture.env.OPENAI_API_KEY).toBeUndefined();
    expect(capture.env.CHROMEX_GATEWAY_TOKEN).toBeUndefined();
  });

  test("returns CODEX_TIMEOUT when child process exceeds timeout", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "vision-runner-test-"));
    const command = await writeFakeCodexCommand(tempRoot, "timeout");
    const runner = new CodexVisionRunner({
      codexCommand: command,
      codexHome: tempRoot,
      healthSchemaPath: join(tempRoot, "schema.json"),
      foodSchemaPath: join(tempRoot, "food-schema.json"),
      tempRoot: join(tempRoot, "tmp"),
      timeoutMs: 20,
    });
    await writeFile(join(tempRoot, "schema.json"), "{}");

    await expect(
      runner.run({
        requestId: "req-timeout",
        filename: "garmin.png",
        mimeType: "image/png",
        imageBytes: Buffer.from("image"),
        context: {},
      }),
    ).rejects.toMatchObject({ code: "CODEX_TIMEOUT" });
  });

  test("returns CODEX_NO_OUTPUT when child exits without output file", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "vision-runner-test-"));
    const command = await writeFakeCodexCommand(tempRoot, "no-output");
    const runner = new CodexVisionRunner({
      codexCommand: command,
      codexHome: tempRoot,
      healthSchemaPath: join(tempRoot, "schema.json"),
      foodSchemaPath: join(tempRoot, "food-schema.json"),
      tempRoot: join(tempRoot, "tmp"),
      timeoutMs: 5_000,
    });
    await writeFile(join(tempRoot, "schema.json"), "{}");

    await expect(
      runner.run({
        requestId: "req-no-output",
        filename: "garmin.png",
        mimeType: "image/png",
        imageBytes: Buffer.from("image"),
        context: {},
      }),
    ).rejects.toMatchObject({ code: "CODEX_NO_OUTPUT" });
  });

  test("returns SCHEMA_VERSION_MISMATCH for valid JSON with wrong version", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "vision-runner-test-"));
    const command = await writeFakeCodexCommand(tempRoot, "wrong-version");
    const runner = new CodexVisionRunner({
      codexCommand: command,
      codexHome: tempRoot,
      healthSchemaPath: join(tempRoot, "schema.json"),
      foodSchemaPath: join(tempRoot, "food-schema.json"),
      tempRoot: join(tempRoot, "tmp"),
      timeoutMs: 5_000,
    });
    await writeFile(join(tempRoot, "schema.json"), "{}");

    await expect(
      runner.run({
        requestId: "req-version",
        filename: "garmin.png",
        mimeType: "image/png",
        imageBytes: Buffer.from("image"),
        context: {},
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_VERSION_MISMATCH" });
  });

  test("normalizes semantically empty extraction to no_metrics_visible", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "vision-runner-test-"));
    const command = await writeFakeCodexCommand(tempRoot, "empty-extraction");
    const runner = new CodexVisionRunner({
      codexCommand: command,
      codexHome: tempRoot,
      healthSchemaPath: join(tempRoot, "schema.json"),
      foodSchemaPath: join(tempRoot, "food-schema.json"),
      tempRoot: join(tempRoot, "tmp"),
      timeoutMs: 5_000,
    });
    await writeFile(join(tempRoot, "schema.json"), "{}");

    const result = await runner.run({
      requestId: "req-empty",
      filename: "garmin.png",
      mimeType: "image/png",
      imageBytes: Buffer.from("image"),
      context: {},
    });

    expect(result.extraction).toMatchObject({
      confidence: "low",
      source_confidence: "low",
      extraction_status: "no_metrics_visible",
      metrics: [],
    });
  });
});

function createFakeRunner(): VisionRunner & { run: ReturnType<typeof vi.fn> } {
  return {
    describe: () => ({ type: "fake" }),
    cleanupStaleTempDirs: vi.fn(async () => undefined),
    run: vi.fn(async () => fakeVisionResult()),
  };
}

function fakeVisionResult() {
  return {
    schemaVersion: 1,
    model: "fake",
    extraction: {
      upload_date: "2026-05-01T07:40:00Z",
      metric_date: "2026-05-01",
      screenshot_label_date: "Today",
      source: "garmin",
      source_confidence: "high",
      confidence: "medium",
      extraction_status: "extracted",
      metrics: [
        {
          metric_type: "body_battery",
          value_text: "82",
          numeric_value: 82,
          unit: null,
          confidence: "medium",
          evidence: "Body Battery 82",
        },
      ],
      summary: "Body battery is visible.",
      missing_fields: [],
      source_assumptions: [],
      trend_interpretation_allowed: false,
    },
  };
}

function fakeFoodResult() {
  return {
    schemaVersion: 1,
    model: "fake",
    classification: {
      protein_present: "yes",
      carbs_before_workout: "not_applicable",
      carbs_after_workout: "yes",
      vegetables_present: "yes",
      alcohol_present: "no",
      late_heavy_meal: "unclear",
      confidence: "medium",
      note: "Coarse pattern: balanced meal with visible protein and vegetables.",
      missing_fields: [],
      source_assumptions: [],
    },
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

function visionRequest(options: {
  requestId?: string;
  filename?: string;
  mimeType?: string;
  base64: string;
}) {
  return {
    request_id: options.requestId ?? "req-1",
    image: {
      filename: options.filename ?? "garmin.png",
      mime_type: options.mimeType ?? "image/png",
      base64: options.base64,
    },
    context: {
      upload_date: "2026-05-01T07:40:00+03:00",
    },
  };
}

async function postVision(port: number, body: Record<string, unknown>) {
  const response = await fetch(`http://127.0.0.1:${port}/api/vision/health-snapshot`, {
    method: "POST",
    headers: {
      authorization: "Bearer vision-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function writeFakeCodexCommand(
  dir: string,
  mode: "capture-invocation" | "empty-extraction" | "no-output" | "timeout" | "wrong-version",
  capturePath = "",
): Promise<string> {
  const command = join(dir, `fake-codex-${mode}.mjs`);
  const source = `#!/usr/bin/env node
const mode = ${JSON.stringify(mode)};
const capturePath = ${JSON.stringify(capturePath)};
const outIndex = process.argv.indexOf("--output-last-message");
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : "";
if (mode === "timeout") {
  setInterval(() => {}, 1000);
} else if (mode === "capture-invocation") {
  let stdin = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    stdin += chunk;
  }
  const { writeFile } = await import("node:fs/promises");
  await writeFile(capturePath, JSON.stringify({ argv: process.argv.slice(2), stdin, env: process.env }, null, 2));
  await writeFile(outPath, JSON.stringify({ schema_version: 1, extraction: { source: "unknown", confidence: "low", metrics: [] } }));
} else if (mode === "wrong-version") {
  await import("node:fs/promises").then(({ writeFile }) => writeFile(outPath, JSON.stringify({ schema_version: 2, extraction: {} })));
} else if (mode === "empty-extraction") {
  await import("node:fs/promises").then(({ writeFile }) => writeFile(outPath, JSON.stringify({ schema_version: 1, extraction: { source: "unknown", confidence: "high", metrics: [] } })));
} else {
  process.exit(0);
}
`;
  await writeFile(command, source, { mode: 0o700 });
  await chmod(command, 0o700);
  return command;
}
