# Evolution Log

## 2026-05-04 - Gateway PR Split And Codex Exec Hardening

- Intent: preserve the deployed private gateway work as a focused server PR
  before separating extension and bridge hardening into a follow-up branch.
- Changes: captured the dirty gateway state, added a shared Codex exec helper
  for vision/coach runners, moved prompts to stdin, added output-size checks,
  constrained subprocess env to an allowlist, and tightened Docker context
  exclusions for local secrets and generated artifacts.
- Safety impact: Codex subprocesses no longer inherit application/OpenAI/token
  environment variables, prompts are not exposed as argv, and oversized or
  missing output files become structured Codex errors.
- Deploy/runtime impact: CLI invocation now uses
  `codex --ask-for-approval never exec ... -C <temp-dir> -`, matching the
  currently tested Codex exec style while keeping the gateway localhost-only.
- Verification: `npm run build --workspace @codex-sidepanel/server`,
  `npm run test --workspace @codex-sidepanel/server`, and
  `npm run typecheck --workspace @codex-sidepanel/server`.
- Next questions: smoke the real deployed gateway with production tokens before
  publishing the extension/bridge hardening PR.

## 2026-05-03 - Read-Only Coach Gateway Endpoints

- Intent: let the marathon Mini App use the installed Codex runtime for
  project-aware coach chat while keeping DB writes and weekly-plan application
  inside the app server.
- Changes: added `/api/coach/healthz`, `/api/coach/chat`, and
  `/api/coach/week-proposal`, separate `CHROMEX_COACH_API_TOKEN`, Codex exec
  runner with read-only sandbox, timeout, output schemas, busy handling, and
  tests for auth, success, invalid schema, timeout/busy, and log redaction.
- Safety impact: coach endpoints reject raw secret/path-bearing context, do not
  log tokens/initData/file paths/raw context, and return only schema-validated
  read-only responses or draft proposal summaries.
- Deploy/runtime impact: Docker compose now exposes `CHROMEX_COACH_API_TOKEN`
  and mounts a dedicated `coach-tmp` volume. Caddy should keep `/api/coach/*`
  private like `/api/vision/*`.
- Verification: `npm run test --workspace @codex-sidepanel/server` and
  `npm run typecheck --workspace @codex-sidepanel/server`.
- Next questions: deploy and smoke `/api/coach/healthz` from localhost before
  enabling `CODEX_GATEWAY_COACH_TOKEN` in the marathon app.

## 2026-05-01 - Private Vision Endpoint For Marathon Bot

- Intent: let the personal Telegram marathon bot submit Garmin/Oura screenshots
  to the Codex gateway without exposing raw app-server or general RPC.
- Changes: added `/api/vision/health-snapshot`, `CodexVisionRunner`,
  schema-snapshot output validation, process-level timeout handling, temp cleanup,
  separate vision token auth, and server tests.
- Safety impact: `/api/vision/*` is not proxied by Caddy; logs exclude tokens,
  base64, raw model output, and full extraction payloads.
- Deploy/runtime impact: Docker now pins Codex CLI, listens on container port
  `18787`, publishes only `127.0.0.1:18787:18787`, and mounts a dedicated
  vision temp directory.
- Verification: `npm run test --workspace @codex-sidepanel/server`,
  `npm run typecheck --workspace @codex-sidepanel/server`.
- Next questions: deploy with `CHROMEX_VISION_API_TOKEN` and smoke with real
  Garmin/Oura screenshots.

## 2026-04-30 - Personal Gateway Hetzner Edge

- Intent: deploy the personal Chromex gateway behind the existing IP-based HTTPS edge on Hetzner.
- Changes: added a gateway-only Docker Compose file that publishes the Node gateway on `127.0.0.1:18787` and uses `/data/chromex-gateway/*` bind mounts.
- Safety impact: the gateway stays localhost-only behind Caddy; Caddy and Certbot own public TLS on `204.168.229.226`.
- Deploy/runtime impact: server deployment uses `/opt/chromex-gateway` plus `/data/chromex-gateway/secrets/gateway.env`.
- Verification: `npm run typecheck`, server gateway tests, selected extension hardening tests, Docker image build, HTTPS `/healthz`, gateway `/readyz`, and WSS `gateway.auth -> account.status` smoke.
- Next questions: complete ChatGPT device-code login smoke from the installed unpacked extension.
