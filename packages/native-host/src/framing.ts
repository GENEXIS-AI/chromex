export function encodeNativeMessage(payload: unknown): Buffer {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export function decodeNativeMessage(buffer: Buffer): unknown {
  const bodyLength = buffer.readUInt32LE(0);
  const body = buffer.subarray(4, 4 + bodyLength).toString("utf8");
  return JSON.parse(body);
}

export class NativeMessageStreamDecoder {
  #buffer = Buffer.alloc(0);

  push(chunk: Buffer): unknown[] {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const messages: unknown[] = [];

    while (this.#buffer.length >= 4) {
      const bodyLength = this.#buffer.readUInt32LE(0);
      const totalLength = 4 + bodyLength;
      if (this.#buffer.length < totalLength) {
        break;
      }

      messages.push(decodeNativeMessage(this.#buffer.subarray(0, totalLength)));
      this.#buffer = this.#buffer.subarray(totalLength);
    }

    return messages;
  }
}
