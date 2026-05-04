import { spawnSync } from "node:child_process";

import { createGatewayServer } from "./gateway.js";

const token = process.env.CHROMEX_GATEWAY_TOKEN ?? "";
const visionToken = process.env.CHROMEX_VISION_API_TOKEN ?? "";
const coachToken = process.env.CHROMEX_COACH_API_TOKEN ?? "";
const port = Number(process.env.PORT ?? "18787");
const host = process.env.HOST ?? "127.0.0.1";

logCodexVersion();

const gateway = createGatewayServer({ token, host, port, visionToken, coachToken });

gateway.listen().then(({ port: actualPort }) => {
  console.error(`Chromex gateway listening on ${host}:${actualPort}`);
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await gateway.close().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
  });
  process.exit(0);
}

function logCodexVersion(): void {
  const command = process.env.CHROMEX_CODEX_BIN ?? "codex";
  const result = spawnSync(command, ["--version"], {
    encoding: "utf-8",
    timeout: 5_000,
  });
  if (result.status === 0) {
    console.error(`Codex CLI version: ${result.stdout.trim()}`);
    return;
  }
  console.error("Codex CLI version unavailable.");
}
