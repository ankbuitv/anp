import { describe, expect, it } from "vitest";
import { deleteKeys, parseRange, putObject, resumeMultipart, serveObject, startMultipart } from "../worker/src/lib/kv";

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
