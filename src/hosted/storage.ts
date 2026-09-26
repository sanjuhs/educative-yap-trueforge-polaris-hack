import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream } from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
export type StorageOptions = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
};
export function storageOptionsFromEnv(): StorageOptions | null {
  const {
    R2_ENDPOINT: endpoint,
    R2_BUCKET: primaryBucket,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
  } = process.env;
  const bucket = primaryBucket || process.env.R2_BUCKET_NAME;
  if (!endpoint && !bucket && !accessKeyId && !secretAccessKey) return null;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey)
    throw new Error(
      "All R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY settings are required",
    );
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    prefix: process.env.R2_PREFIX || "educative-yap",
  };
}
export class PrivateStorage {
  readonly client: S3Client;
  readonly prefix: string;
  readonly encryptionKey: Buffer | undefined;
  constructor(readonly options: StorageOptions) {
    const secret = process.env.R2_ENCRYPTION_KEY;
    if (secret && !/^[a-f0-9]{64}$/i.test(secret))
      throw new Error(
        "R2_ENCRYPTION_KEY must be 32 random bytes encoded as hex",
      );
    this.encryptionKey = secret ? Buffer.from(secret, "hex") : undefined;
    if (
      ["1", "true"].includes(process.env.YAP_HOSTED || "") &&
      !this.encryptionKey
    )
      throw new Error("Hosted object storage requires R2_ENCRYPTION_KEY");
    this.prefix = (options.prefix || "educative-yap").replace(/^\/+|\/+$/g, "");
    if (!/^[A-Za-z0-9_/-]+$/.test(this.prefix) || this.prefix.includes(".."))
      throw new Error("Invalid storage prefix");
    this.client = new S3Client({
      region: "auto",
      endpoint: options.endpoint,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }
  key(userId: string, resourceId: string, filename: string): string {
    for (const value of [userId, resourceId, filename])
      if (!/^[A-Za-z0-9_.-]+$/.test(value) || value === "." || value === "..")
        throw new Error("Invalid object path component");
    return `${this.prefix}/${userId}/${resourceId}/${filename}`;
  }
  assertOwnedKey(userId: string, key: string) {
    if (
      !/^[A-Za-z0-9_-]+$/.test(userId) ||
      !key.startsWith(`${this.prefix}/${userId}/`) ||
      key.includes("..")
    )
      throw new Error("Object does not belong to this user");
  }
  async putFile(
    userId: string,
    resourceId: string,
    filename: string,
    localPath: string,
    contentType: string,
  ) {
    const key = this.key(userId, resourceId, filename);
    let uploadPath = localPath;
    let temp: string | undefined;
    let tag: Buffer | undefined;
    let nonce: Buffer | undefined;
    try {
      if (this.encryptionKey) {
        temp = await fs.mkdtemp(path.join(os.tmpdir(), "yap-encrypt-"));
        uploadPath = path.join(temp, "object");
        nonce = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, nonce);
        cipher.setAAD(Buffer.from(key));
        await pipeline(
          createReadStream(localPath),
          cipher,
          createWriteStream(uploadPath, { mode: 0o600 }),
        );
        tag = cipher.getAuthTag();
      }
      const stat = await fs.stat(uploadPath);
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          Body: createReadStream(uploadPath),
          ContentLength: stat.size,
          ContentType: this.encryptionKey
            ? "application/octet-stream"
            : contentType,
          CacheControl: "private, no-store",
          ...(nonce && tag
            ? {
                Metadata: {
                  "yap-encryption": "aes-256-gcm-v1",
                  "yap-nonce": nonce.toString("hex"),
                  "yap-tag": tag.toString("hex"),
                },
              }
            : {}),
        }),
      );
      return key;
    } finally {
      if (temp) await fs.rm(temp, { recursive: true, force: true });
    }
  }
  async putJson(
    userId: string,
    resourceId: string,
    filename: string,
    value: unknown,
  ) {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "yap-json-"));
    try {
      const file = path.join(temp, "data.json");
      await fs.writeFile(file, JSON.stringify(value), { mode: 0o600 });
      return await this.putFile(
        userId,
        resourceId,
        filename,
        file,
        "application/json",
      );
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
  /** Authenticate the entire encrypted object before exposing any plaintext to a response. */
  async downloadFile(userId: string, key: string, destination: string) {
    this.assertOwnedKey(userId, key);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    if (!result.Body) throw new Error("Object is empty");
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const temporary =
      destination + "." + randomBytes(8).toString("hex") + ".tmp";
    try {
      const source = result.Body as Readable;
      const metadata = result.Metadata || {};
      if (metadata["yap-encryption"]) {
        if (
          !this.encryptionKey ||
          metadata["yap-encryption"] !== "aes-256-gcm-v1"
        )
          throw new Error("Unsupported encrypted object");
        if (
          !/^[a-f0-9]{24}$/.test(metadata["yap-nonce"] || "") ||
          !/^[a-f0-9]{32}$/.test(metadata["yap-tag"] || "")
        )
          throw new Error("Invalid encrypted object metadata");
        const decipher = createDecipheriv(
          "aes-256-gcm",
          this.encryptionKey,
          Buffer.from(metadata["yap-nonce"], "hex"),
        );
        decipher.setAAD(Buffer.from(key));
        decipher.setAuthTag(Buffer.from(metadata["yap-tag"], "hex"));
        await pipeline(
          source,
          decipher,
          createWriteStream(temporary, { mode: 0o600 }),
        );
      } else {
        if (this.encryptionKey)
          throw new Error(
            "Refusing an unencrypted object in encrypted hosted storage",
          );
        await pipeline(source, createWriteStream(temporary, { mode: 0o600 }));
      }
      await fs.rename(temporary, destination);
    } catch (error) {
      await fs.rm(temporary, { force: true });
      throw error;
    }
  }
  /** Call only after DB ownership checks. Signed URLs are short-lived bearer URLs. */
  async signedGet(
    userId: string,
    key: string,
    downloadName?: string,
    expiresIn = 300,
  ) {
    this.assertOwnedKey(userId, key);
    if (this.encryptionKey)
      throw new Error(
        "Encrypted media must be served through authenticated backend downloads",
      );
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ...(downloadName
          ? {
              ResponseContentDisposition: `attachment; filename="${downloadName.replace(/[^A-Za-z0-9_.-]/g, "_")}"`,
            }
          : {}),
      }),
      { expiresIn: Math.max(1, Math.min(expiresIn, 900)) },
    );
  }
  async delete(userId: string, key: string) {
    this.assertOwnedKey(userId, key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
  }
}
