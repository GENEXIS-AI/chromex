import { describe, expect, test } from "vitest";

import { decodeNativeMessage, encodeNativeMessage } from "../src/index.js";

describe("native messaging framing", () => {
  test("encodes a message with a 32-bit little-endian length prefix", () => {
    const payload = { hello: "world" };
    const encoded = encodeNativeMessage(payload);

    expect(encoded.readUInt32LE(0)).toBe(Buffer.byteLength(JSON.stringify(payload)));
    expect(encoded.subarray(4).toString("utf8")).toBe(JSON.stringify(payload));
  });

  test("decodes a framed message back into an object", () => {
    const payload = { type: "ping", count: 1 };
    const encoded = encodeNativeMessage(payload);

    expect(decodeNativeMessage(encoded)).toEqual(payload);
  });
});
