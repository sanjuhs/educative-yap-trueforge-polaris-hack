import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { PrivateStorage } from "../src/hosted/storage.js";

test("encrypted objects round-trip, bind owner/path, and authenticate before exposing plaintext", async () => {
  const previous = process.env.R2_ENCRYPTION_KEY;
  process.env.R2_ENCRYPTION_KEY = "ab".repeat(32);
  const storage = new PrivateStorage({
    endpoint: "https://example.invalid",
    bucket: "test",
    accessKeyId: "test",
    secretAccessKey: "test",
  });
  if (previous === undefined) delete process.env.R2_ENCRYPTION_KEY;
  else process.env.R2_ENCRYPTION_KEY = previous;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "yap-storage-test-"));
  let captured: any;
  let bytes = Buffer.alloc(0);
  storage.client.send = (async (command: any) => {
    if (command.constructor.name === "PutObjectCommand") {
      captured = command.input;
      const chunks = [];
      for await (const chunk of captured.Body) chunks.push(Buffer.from(chunk));
      bytes = Buffer.concat(chunks);
      return {};
    }
    return { Metadata: captured.Metadata, Body: Readable.from(bytes) };
  }) as any;
  try {
    const input = path.join(temp, "input");
    await fs.writeFile(input, "Private creator recording and transcript");
    const key = await storage.putFile(
      "owner",
      "asset",
      "video.mp4",
      input,
      "video/mp4",
    );
    assert.ok(!bytes.includes(Buffer.from("Private creator")));
    assert.equal(captured.ContentType, "application/octet-stream");
    await assert.rejects(
      storage.signedGet("owner", key),
      /authenticated backend/,
    );
    await assert.rejects(
      storage.downloadFile("other", key, path.join(temp, "wrong")),
      /does not belong/,
    );
    const output = path.join(temp, "output");
    await storage.downloadFile("owner", key, output);
    assert.equal(
      await fs.readFile(output, "utf8"),
      await fs.readFile(input, "utf8"),
    );
    bytes[0] ^= 1;
    const tampered = path.join(temp, "tampered");
    await assert.rejects(storage.downloadFile("owner", key, tampered));
    await assert.rejects(fs.access(tampered));
    assert.ok(!(await fs.readdir(temp)).some((name) => name.endsWith(".tmp")));
    bytes[0] ^= 1;
    await assert.rejects(
      storage.downloadFile(
        "owner",
        storage.key("owner", "different", "video.mp4"),
        path.join(temp, "swapped"),
      ),
    );
  } finally {
    storage.client.destroy();
    await fs.rm(temp, { recursive: true, force: true });
  }
});
