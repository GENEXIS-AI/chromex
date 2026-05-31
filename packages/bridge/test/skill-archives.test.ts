import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { ExternalSkillArchiveStore } from "../src/index.js";

describe("ExternalSkillArchiveStore", () => {
  test("installs a zipped Codex skill and returns a structured skill option", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "codex-sidepanel-skills-"));
    const store = new ExternalSkillArchiveStore(rootDir);
    const archive = createStoredZip({
      "korean-ui/SKILL.md": [
        "---",
        "name: korean-ui",
        "description: Korean UI review assistant",
        "---",
        "Use concise Korean UI review guidance.",
      ].join("\n"),
    });

    const result = await store.installArchive(
      {
        filename: "korean-ui.zip",
        base64: archive.toString("base64"),
      },
      "/tmp/project",
    );

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toMatchObject({
      name: "korean-ui",
      description: "Korean UI review assistant",
      scope: "user",
      cwd: "/tmp/project",
      token: "$korean-ui",
    });
    const skillPath = result.skills[0]?.path.replace(/\\/gu, "/") ?? "";
    expect(skillPath.endsWith("/korean-ui/SKILL.md")).toBe(true);
    await expect(store.listSkillRoots()).resolves.toContain(result.skills[0]?.path.replace(/[\\/]SKILL\.md$/u, ""));
  });

  test("rejects unsafe archive paths", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "codex-sidepanel-skills-"));
    const store = new ExternalSkillArchiveStore(rootDir);
    const archive = createStoredZip({
      "../bad/SKILL.md": "name: bad\n",
    });

    await expect(
      store.installArchive({
        filename: "bad.zip",
        base64: archive.toString("base64"),
      }),
    ).rejects.toThrow(/unsafe path/i);
  });
});

function createStoredZip(files: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
