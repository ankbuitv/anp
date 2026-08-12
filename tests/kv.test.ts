import { describe, expect, it } from "vitest";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { deleteKeys, parseRange, putObject, resumeMultipart, serveObject, startMultipart } from "../worker/src/lib/kv";
import { B2Storage, registerB2Storage } from "../worker/src/lib/b2";

type Entry = { value: ArrayBuffer; metadata?: unknown };

class MemoryKv {
  readonly entries = new Map<string, Entry>();

  async put(key: string, value: string | ArrayBuffer | ArrayBufferView, options?: { metadata?: unknown }) {
    let bytes: Uint8Array;
    if (typeof value === "string") bytes = new TextEncoder().encode(value);
    else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    else bytes = new Uint8Array(value);
    this.entries.set(key, { value: bytes.slice().buffer, metadata: options?.metadata });
  }

  async get(key: string, type?: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (type === "arrayBuffer") return entry.value.slice(0);
    return new TextDecoder().decode(entry.value);
  }

  async getWithMetadata(key: string) {
    const entry = this.entries.get(key);
    return entry
      ? { value: entry.value.slice(0), metadata: entry.metadata ?? null, cacheStatus: null }
      : { value: null, metadata: null, cacheStatus: null };
  }

  async delete(key: string) {
    this.entries.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
    const prefix = options?.prefix ?? "";
    const names = [...this.entries.keys()].filter((key) => key.startsWith(prefix)).sort();
    return {
      keys: names.map((name) => ({ name })),
      list_complete: true as const,
      cacheStatus: null,
    };
  }
}

function storage(kv: MemoryKv) {
  return { MEDIA: kv as unknown as KVNamespace } as import("../worker/src/env").Env;
}

/** Env có cả KV lẫn B2, với B2 được thay bằng bucket trong bộ nhớ. */
function b2Env(kv: MemoryKv) {
  const bucket = new Map<string, { body: Uint8Array; contentType: string }>();
  const client = {
    async send(command: unknown) {
      if (command instanceof PutObjectCommand) {
        const input = command.input;
        bucket.set(String(input.Key), {
          body: input.Body as Uint8Array,
          contentType: input.ContentType || "application/octet-stream",
        });
        return {};
      }
      if (command instanceof DeleteObjectsCommand) {
        for (const object of command.input.Delete?.Objects ?? []) bucket.delete(String(object.Key));
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const entry = bucket.get(String(command.input.Key));
        if (!entry) {
          throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
        }
        return { Body: entry.body, ContentLength: entry.body.byteLength, ContentType: entry.contentType };
      }
      return {};
    },
  };
  const env = {
    ...storage(kv),
    B2_BUCKET: "anp-media",
    B2_ENDPOINT: "https://s3.us-east-005.backblazeb2.com",
    B2_KEY_ID: "application-key-id",
    B2_APP_KEY: "application-key-secret",
  };
  registerB2Storage(env, new B2Storage({ B2_BUCKET: "anp-media" }, client as never));
  return { env, bucket };
}

describe("Workers KV object storage", () => {
  it("stores and serves a single-value object", async () => {
    const kv = new MemoryKv();
    await putObject(storage(kv), "photo", "hello", "text/plain");

    const response = await serveObject(storage(kv), "photo", new Request("https://anp.test/photo"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("Content-Length")).toBe("5");
    expect(await response.text()).toBe("hello");
  });

  it("serves a byte range across multipart values", async () => {
    const kv = new MemoryKv();
    const upload = await startMultipart(storage(kv), "video", "video/mp4");
    const first = await upload.uploadPart(1, new TextEncoder().encode("hello"));
    const second = await upload.uploadPart(2, new TextEncoder().encode("world"));
    await upload.complete([first, second]);

    const response = await serveObject(
      storage(kv),
      "video",
      new Request("https://anp.test/video", { headers: { Range: "bytes=3-7" } }),
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 3-7/10");
    expect(response.headers.get("Content-Length")).toBe("5");
    expect(await response.text()).toBe("lowor");
  });

  it("keeps legacy multipart sessions on KV after B2 is configured", async () => {
    const kv = new MemoryKv();
    const env = {
      ...storage(kv),
      B2_BUCKET: "anp-media",
      B2_ENDPOINT: "https://s3.us-east-005.backblazeb2.com",
      B2_KEY_ID: "application-key-id",
      B2_APP_KEY: "application-key-secret",
    };
    const upload = resumeMultipart(env, "legacy", "legacy-kv-upload", "image/jpeg");
    await upload.uploadPart(1, new Uint8Array([1, 2, 3]));
    expect([...kv.entries.keys()]).toEqual(["__anp/parts/legacy/legacy-kv-upload/000001"]);
  });

  it("writes to B2 instead of KV when B2 is configured", async () => {
    const kv = new MemoryKv();
    const { env, bucket } = b2Env(kv);

    await putObject(env, "photo", "hello", "text/plain");
    // B2 là nơi lưu chính; KV không còn nhận bản ghi mới.
    expect(bucket.has("photo")).toBe(true);
    expect([...kv.entries.keys()]).not.toContain("photo");
  });

  it("falls back to KV when B2 rejects the write so uploads keep working", async () => {
    const kv = new MemoryKv();
    const env = {
      ...storage(kv),
      B2_BUCKET: "anp-media",
      B2_ENDPOINT: "https://s3.us-east-005.backblazeb2.com",
      B2_KEY_ID: "application-key-id",
      B2_APP_KEY: "application-key-secret",
    };
    const failing = {
      async send() {
        throw Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
      },
    };
    registerB2Storage(env, new B2Storage({ B2_BUCKET: "anp-media" }, failing as never));

    await putObject(env, "photo", "hello", "text/plain");
    expect([...kv.entries.keys()]).toContain("photo");
  });

  it("still serves objects that only exist in KV after switching to B2", async () => {
    const kv = new MemoryKv();
    await putObject(storage(kv), "photo", "hello", "text/plain");
    const { env } = b2Env(kv);

    const response = await serveObject(env, "photo", new Request("https://anp.test/photo"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(await response.text()).toBe("hello");
  });

  it("deletes from both KV and B2 when configured", async () => {
    const kv = new MemoryKv();
    await putObject(storage(kv), "photo", "hello", "text/plain");
    const { env, bucket } = b2Env(kv);
    await putObject(env, "photo", "hello", "text/plain");
    expect(bucket.has("photo")).toBe(true);

    await deleteKeys(env, ["photo"]);
    expect(kv.entries.size).toBe(0);
    expect(bucket.has("photo")).toBe(false);
  });

  it("throws not found when neither KV nor B2 can serve the object", async () => {
    const kv = new MemoryKv();
    await expect(
      serveObject(storage(kv), "missing", new Request("https://anp.test/missing")),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("removes manifests, parts, and aborted uploads", async () => {
    const kv = new MemoryKv();
    const upload = await startMultipart(storage(kv), "media", "image/jpeg");
    expect(upload.uploadId).toMatch(/^kv:/);
    await upload.uploadPart(1, new Uint8Array([1, 2, 3]));
    await upload.abort();
    expect(kv.entries.size).toBe(0);

    const resumed = resumeMultipart(storage(kv), "media", "upload-id", "image/jpeg");
    const part = await resumed.uploadPart(1, new Uint8Array([1, 2, 3]));
    await resumed.complete([part]);
    expect(kv.entries.size).toBe(2);
    await deleteKeys(storage(kv), ["media"]);
    expect(kv.entries.size).toBe(0);
  });
});

describe("parseRange", () => {
  it("normalizes explicit and suffix ranges", () => {
    expect(parseRange("bytes=2-20", 10)).toEqual({ offset: 2, length: 8 });
    expect(parseRange("bytes=-3", 10)).toEqual({ offset: 7, length: 3 });
    expect(parseRange("bytes=20-30", 10)).toBeNull();
  });
});
