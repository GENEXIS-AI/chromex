import { WebSocket } from "ws";

const url = process.env.CHROMEX_GATEWAY_URL ?? "ws://127.0.0.1:8787/rpc";
const token = process.env.CHROMEX_GATEWAY_TOKEN ?? "";

if (!token) {
  throw new Error("Set CHROMEX_GATEWAY_TOKEN before running gateway smoke.");
}

const websocket = new WebSocket(url);
let nextId = 1;

websocket.on("open", () => {
  send("gateway.auth", {
    token,
    clientId: "gateway-smoke",
    protocolVersion: 1,
  });
});

websocket.on("message", (data) => {
  const message = JSON.parse(String(data));
  if (message.id === "1") {
    if (message.error) {
      throw new Error(`Gateway auth failed: ${message.error.message ?? "unknown error"}`);
    }
    send("account.status", {});
    return;
  }
  if (message.id === "2") {
    if (message.error) {
      throw new Error(`account.status failed: ${message.error.message ?? "unknown error"}`);
    }
    console.log(JSON.stringify(message.result, null, 2));
    websocket.close();
  }
});

websocket.on("error", (error) => {
  throw error;
});

function send(method, params) {
  websocket.send(JSON.stringify({ id: String(nextId++), method, params }));
}
