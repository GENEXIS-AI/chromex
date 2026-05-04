# Personal Chromex Gateway MVP

This branch implements a single-user remote gateway for Chromex.

Decisions:

- The Chrome extension connects to a personal HTTPS/WSS gateway on the user's VPS.
- The gateway owns the local Codex bridge runtime and starts `codex app-server` with `--listen stdio://`.
- The raw Codex app-server websocket transport is never exposed.
- WebSocket authentication happens as the first message, not through custom browser WebSocket headers.
- ChatGPT/Codex authentication uses `chatgptDeviceCode`; Codex credentials remain in the server `CODEX_HOME`.
- A private localhost-only `POST /api/vision/health-snapshot` endpoint can run
  Codex image extraction for the marathon Telegram bot. Caddy must not expose
  `/api/vision/*` publicly.
- The vision and coach endpoints use separate API tokens, exported schema
  snapshots, `codex --ask-for-approval never exec`, a read-only sandbox, prompt
  over stdin, output files, output-size caps, and a minimal Codex subprocess env.
- The extension may temporarily keep broad page permissions for MVP feature parity.
- The gateway token is stored in `chrome.storage.local`, with access restricted to trusted extension contexts.
- Content scripts must not read Chrome storage directly.
- DOM action snapshots must not include real form or editor values.
