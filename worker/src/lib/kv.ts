import type { Env } from "../env";
import { getB2Storage, isB2Configured } from "./b2";
import { ApiError, Errors } from "./errors";

const STORAGE_VERSION = 1;
const PART_PREFIX = "__anp/parts";

export type StoredPart = {
  partNumber: number;
  etag: string;
  size: number;
  key: string;
};

type StorageMetadata = {
  version: number;
  kind: "single" | "chunked";
  contentType: string;
  size: number;
  etag: string;
};

type PartMetadata = {
  version: number;
  size: number;
  etag: string;
};

type Manifest = {
  version: number;
  kind: "chunked";
  uploadId: string;
  contentType: string;
  size: number;
  etag: string;
  parts: StoredPart[];
};

export type MpPart = { partNumber: number; etag: string; size: number };

export type StorageBody = ReadableStream | ArrayBuffer | ArrayBufferView | Uint8Array | Blob | string;

function objectPrefix(key: string) {
  return `${PART_PREFIX}/${encodeURIComponent(key)}/`;
}

function uploadPrefix(key: string, uploadId: string) {
  return `${objectPrefix(key)}${uploadId}/`;
}

function partKey(key: string, uploadId: string, partNumber: number) {
  return `${uploadPrefix(key, uploadId)}${String(partNumber).padStart(6, "0")}`;
}

async function bodyToArrayBuffer(body: StorageBody): Promise<ArrayBuffer> {
  if (typeof body === "string") return new TextEncoder().encode(body).buffer as ArrayBuffer;
  if (body instanceof ArrayBuffer) return body;
  if (ArrayBuffer.isView(body)) {
    return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  }
  if (body instanceof Blob) return body.arrayBuffer();
  return new Response(body).arrayBuffer();
}

async function deleteInBatches(namespace: KVNamespace, keys: string[]) {
  for (let i = 0; i < keys.length; i += 50) {
    await Promise.all(keys.slice(i, i + 50).map((key) => namespace.delete(key)));
  }
}

async function deletePrefix(namespace: KVNamespace, prefix: string, keepPrefix?: string) {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await namespace.list({ prefix, cursor, limit: 1000 });
    keys.push(...page.keys.map((entry) => entry.name).filter((key) => !keepPrefix || !key.startsWith(keepPrefix)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  await deleteInBatches(namespace, keys);
}

async function writeManifest(namespace: KVNamespace, key: string, manifest: Manifest) {
  const metadata: StorageMetadata = {
    version: STORAGE_VERSION,
    kind: "chunked",
    contentType: manifest.contentType,
    size: manifest.size,
    etag: manifest.etag,
  };
  await namespace.put(key, JSON.stringify(manifest), { metadata });
}

/**
 * Store a complete object in Workers KV. Values larger than one application
 * chunk are split into independent KV values and represented by a manifest.
 */
async function putKvObject(namespace: KVNamespace, key: string, body: StorageBody, contentType: string) {
  const data = await bodyToArrayBuffer(body);
  const etag = crypto.randomUUID();

  if (data.byteLength <= KV_PART_SIZE) {
    const metadata: StorageMetadata = {
      version: STORAGE_VERSION,
      kind: "single",
      contentType,
      size: data.byteLength,
      etag,
    };
    await namespace.put(key, data, { metadata });
    await deletePrefix(namespace, objectPrefix(key));
    return;
  }

  const uploadId = crypto.randomUUID();
  const currentPrefix = uploadPrefix(key, uploadId);
  const parts: StoredPart[] = [];
  for (let offset = 0, partNumber = 1; offset < data.byteLength; offset += KV_PART_SIZE, partNumber++) {
    const chunk = data.slice(offset, Math.min(offset + KV_PART_SIZE, data.byteLength));
    const chunkEtag = crypto.randomUUID();
    const chunkKey = partKey(key, uploadId, partNumber);
    await namespace.put(chunkKey, chunk, {
      metadata: { version: STORAGE_VERSION, size: chunk.byteLength, etag: chunkEtag } satisfies PartMetadata,
    });
    parts.push({ partNumber, etag: chunkEtag, size: chunk.byteLength, key: chunkKey });
  }

  await writeManifest(namespace, key, {
    version: STORAGE_VERSION,
    kind: "chunked",
    uploadId,
    contentType,
    size: data.byteLength,
    etag,
    parts,
  });
  await deletePrefix(namespace, objectPrefix(key), currentPrefix);
}

async function deleteKvKeys(namespace: KVNamespace, keys: (string | null | undefined)[]) {
  for (const key of keys.filter((value): value is string => !!value)) {
    await namespace.delete(key);
    await deletePrefix(namespace, objectPrefix(key));
  }
}

type RangeSpec = { offset: number; length: number };

export function parseRange(header: string | undefined, size: number): RangeSpec | null {
  if (!header || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;

  const start = match[1] ? Number(match[1]) : NaN;
  const end = match[2] ? Number(match[2]) : NaN;
  if (Number.isFinite(start)) {
    if (start < 0 || start >= size) return null;
    const boundedEnd = Number.isFinite(end) ? Math.min(end, size - 1) : size - 1;
    if (boundedEnd < start) return null;
    return { offset: start, length: boundedEnd - start + 1 };
  }

  if (Number.isFinite(end) && end > 0) {
    const length = Math.min(end, size);
    return { offset: size - length, length };
  }
  return null;
}

function chunkStream(namespace: KVNamespace, parts: StoredPart[], offset: number, length: number) {
  const end = offset + length;
  let cursor = 0;
  const segments: { key: string; from: number; length: number }[] = [];

  for (const part of parts) {
    const partStart = cursor;
    const partEnd = cursor + part.size;
    const from = Math.max(offset, partStart);
    const to = Math.min(end, partEnd);
    if (from < to) segments.push({ key: part.key, from: from - partStart, length: to - from });
    cursor = partEnd;
    if (cursor >= end) break;
  }

  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const segment = segments[index++];
      if (!segment) {
        controller.close();
        return;
      }
      const value = await namespace.get(segment.key, "arrayBuffer");
      if (!value) {
        controller.error(new Error("KV object part is missing"));
        return;
      }
      controller.enqueue(new Uint8Array(value, segment.from, segment.length));
    },
  });
}

async function readObject(namespace: KVNamespace, key: string) {
  const stored = await namespace.getWithMetadata<StorageMetadata>(key, "arrayBuffer");
  if (!stored.value) throw Errors.notFound("Không tìm thấy file.");

  const metadata = stored.metadata;
  if (metadata?.kind === "chunked") {
    let manifest: Manifest;
    try {
      manifest = JSON.parse(new TextDecoder().decode(stored.value)) as Manifest;
    } catch {
      throw Errors.server("Manifest lưu trữ không hợp lệ.");
    }
    if (manifest.kind !== "chunked" || !Array.isArray(manifest.parts)) {
      throw Errors.server("Manifest lưu trữ không hợp lệ.");
    }
    return { metadata, manifest, value: null };
  }

  const fallbackMetadata: StorageMetadata = metadata ?? {
    version: STORAGE_VERSION,
    kind: "single",
    contentType: "application/octet-stream",
    size: stored.value.byteLength,
    etag: "",
  };
  return { metadata: fallbackMetadata, manifest: null, value: stored.value };
}

async function serveKvObject(
  namespace: KVNamespace,
  key: string,
  request: Request,
  fallbackType = "application/octet-stream",
  filename?: string,
): Promise<Response> {
  const object = await readObject(namespace, key);
  const size = object.metadata.size;
  const type = object.metadata.contentType || fallbackType;
  const range = parseRange(request.headers.get("Range") ?? undefined, size);
  const offset = range?.offset ?? 0;
  const length = range?.length ?? size;
  const disposition = filename
    ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    : "inline";

  const headers: Record<string, string> = {
    "Content-Type": type,
    "Content-Length": String(length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": disposition,
  };
  if (object.metadata.etag) headers.ETag = `"${object.metadata.etag}"`;
  if (range) headers["Content-Range"] = `bytes ${offset}-${offset + length - 1}/${size}`;

  let body: BodyInit;
  if (object.manifest) {
    body = chunkStream(namespace, object.manifest.parts, offset, length);
  } else {
    body = object.value!.slice(offset, offset + length);
  }

  return new Response(body, { status: range ? 206 : 200, headers });
}

class KvMultipartUpload {
  constructor(
    private readonly namespace: KVNamespace,
    private readonly key: string,
    readonly uploadId: string,
    private readonly contentType: string,
  ) {}

  async uploadPart(partNumber: number, body: ArrayBuffer | Uint8Array) {
    const data = await bodyToArrayBuffer(body);
    if (data.byteLength > KV_PART_SIZE) throw Errors.payload("Phần vượt giới hạn Workers KV.");
    const etag = crypto.randomUUID();
    await this.namespace.put(partKey(this.key, this.uploadId, partNumber), data, {
      metadata: { version: STORAGE_VERSION, size: data.byteLength, etag } satisfies PartMetadata,
    });
    return { partNumber, etag, size: data.byteLength };
  }

  async complete(parts: MpPart[]) {
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    if (!ordered.length || ordered.some((part, index) => part.partNumber !== index + 1 || part.size <= 0)) {
      throw Errors.badRequest("Danh sách phần tải lên không hợp lệ.");
    }
    const storedParts = ordered.map((part) => ({
      ...part,
      key: partKey(this.key, this.uploadId, part.partNumber),
    }));
    const size = storedParts.reduce((total, part) => total + part.size, 0);
    await writeManifest(this.namespace, this.key, {
      version: STORAGE_VERSION,
      kind: "chunked",
      uploadId: this.uploadId,
      contentType: this.contentType,
      size,
      etag: crypto.randomUUID(),
      parts: storedParts,
    });
    await deletePrefix(this.namespace, objectPrefix(this.key), uploadPrefix(this.key, this.uploadId));
  }

  async abort() {
    await deletePrefix(this.namespace, uploadPrefix(this.key, this.uploadId));
  }
}

// Keep application chunks comfortably below Workers KV's per-value limit.
export const KV_PART_SIZE = 8 * 1024 * 1024;

function kvNamespace(env: Env): KVNamespace {
  if (!env.MEDIA) throw Errors.server("Chưa cấu hình storage MEDIA hoặc Backblaze B2.");
  return env.MEDIA;
}

export async function putObject(env: Env, key: string, body: StorageBody, contentType: string) {
  // B2 là nơi lưu chính: dung lượng lớn, không dính giới hạn 25 MB/value của KV.
  // KV chỉ còn là fallback cho local dev khi chưa cấu hình B2.
  if (isB2Configured(env)) {
    try {
      return await getB2Storage(env).putObject(key, body, contentType);
    } catch (error) {
      // File nhỏ (thumbnail, preview) vẫn nên lên được KV khi B2 lỗi cấu hình,
      // để một credential sai không làm hỏng toàn bộ thư viện ảnh.
      if (!env.MEDIA) throw error;
      await putKvObject(env.MEDIA, key, body, contentType);
      console.error("B2 put failed, đã ghi tạm vào KV", key, error);
      return;
    }
  }
  if (!env.MEDIA) throw Errors.server("Chưa cấu hình storage MEDIA hoặc Backblaze B2.");
  return putKvObject(env.MEDIA, key, body, contentType);
}

export async function deleteKeys(env: Env, keys: (string | null | undefined)[]) {
  // Xoá ở cả hai nguồn để không còn object sót lại khi đọc song song.
  const tasks: Promise<void>[] = [];
  if (env.MEDIA) tasks.push(deleteKvKeys(env.MEDIA, keys).catch(() => {}));
  if (isB2Configured(env)) tasks.push(getB2Storage(env).deleteKeys(keys).catch(() => {}));
  await Promise.all(tasks);
}

/** Đọc song song cả KV và B2, trả nguồn nào trả lời được trước. */
async function serveBoth(candidates: Promise<Response>[]): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let pending = candidates.length;
    const failures: unknown[] = [];
    for (const candidate of candidates) {
      candidate.then(
        (response) => resolve(response),
        (error) => {
          failures.push(error);
          if (--pending === 0) {
            const non404 = failures.find((f) => !(f instanceof ApiError) || f.status !== 404);
            reject(non404 ?? Errors.notFound("Không tìm thấy file."));
          }
        },
      );
    }
  });
}

export async function serveObject(
  env: Env,
  key: string,
  request: Request,
  fallbackType = "application/octet-stream",
  filename?: string,
): Promise<Response> {
  // Đọc đồng thời cả KV lẫn B2 (nếu có); lấy nguồn phản hồi được trước.
  const candidates: Promise<Response>[] = [];
  if (env.MEDIA) {
    candidates.push(serveKvObject(env.MEDIA, key, request, fallbackType, filename));
  }
  if (isB2Configured(env)) {
    candidates.push(getB2Storage(env).serveObject(key, request, fallbackType, filename));
  }
  if (!candidates.length) throw Errors.server("Chưa cấu hình storage MEDIA hoặc Backblaze B2.");
  return serveBoth(candidates);
}

export async function startMultipart(env: Env, key: string, contentType: string) {
  if (isB2Configured(env)) {
    try {
      return await getB2Storage(env).startMultipart(key, contentType);
    } catch (error) {
      // Không có KV để đỡ thì phải báo đúng lỗi B2 cho người dùng.
      if (!env.MEDIA) throw error;
      console.error("B2 startMultipart failed, dùng KV cho phiên này", key, error);
    }
  }
  return new KvMultipartUpload(kvNamespace(env), key, `kv:${crypto.randomUUID()}`, contentType);
}

export function resumeMultipart(env: Env, key: string, uploadId: string, contentType = "application/octet-stream") {
  if (uploadId.startsWith("b2:")) {
    if (!isB2Configured(env)) throw Errors.server("Phiên tải lên B2 không thể tiếp tục vì thiếu cấu hình B2.");
    return getB2Storage(env).resumeMultipart(key, uploadId);
  }
  // IDs without a prefix are legacy KV sessions. Keeping them on KV avoids
  // sending an in-flight pre-rollout upload ID to B2 after credentials turn on.
  return new KvMultipartUpload(kvNamespace(env), key, uploadId, contentType);
}
