import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import type { Env } from "../env";
import { Errors } from "./errors";
import { parseRange, type MpPart, type StorageBody } from "./kv";

export type B2Env = Required<Pick<Env, "B2_BUCKET" | "B2_ENDPOINT" | "B2_KEY_ID" | "B2_APP_KEY">> &
  Pick<Env, "B2_REGION">;

type S3Sender = Pick<S3Client, "send">;

const storageByEnv = new WeakMap<object, B2Storage>();

export function isB2Configured(env: Env): env is Env & B2Env {
  return !!(env.B2_BUCKET && env.B2_ENDPOINT && env.B2_KEY_ID && env.B2_APP_KEY);
}

function regionFromEndpoint(endpoint: string): string {
  try {
    const match = new URL(endpoint).hostname.match(/^s3\.([^.]+)\.backblazeb2\.com$/i);
    if (match?.[1]) return match[1];
  } catch {
    // S3Client will report an invalid endpoint with its normal configuration error.
  }
  return "us-east-005";
}

function createClient(env: B2Env) {
  // The master key ID is the short B2 account ID; bucket-scoped key IDs are longer.
  if (env.B2_KEY_ID.length <= 12) {
    throw Errors.server("B2_KEY_ID có dạng master key; hãy dùng Application Key con giới hạn bucket.");
  }
  return new S3Client({
    endpoint: env.B2_ENDPOINT.replace(/\/$/, ""),
    region: env.B2_REGION || regionFromEndpoint(env.B2_ENDPOINT),
    credentials: {
      accessKeyId: env.B2_KEY_ID,
      secretAccessKey: env.B2_APP_KEY,
    },
    maxAttempts: 4,
    forcePathStyle: true,
    // Backblaze B2 does not require the newer automatic S3 checksum headers.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export function getB2Storage(env: Env & B2Env): B2Storage {
  const cacheKey = env as object;
  let storage = storageByEnv.get(cacheKey);
  if (!storage) {
    storage = new B2Storage(env, createClient(env));
    storageByEnv.set(cacheKey, storage);
  }
  return storage;
}

async function bodyToBytes(body: StorageBody): Promise<Uint8Array> {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  return new Uint8Array(await new Response(body).arrayBuffer());
}

function responseBody(body: unknown): BodyInit | null {
  if (!body) return null;
  if (body instanceof Uint8Array || body instanceof ArrayBuffer || body instanceof Blob || body instanceof ReadableStream) {
    return body as BodyInit;
  }
  const sdkBody = body as { transformToWebStream?: () => ReadableStream<Uint8Array> };
  if (typeof sdkBody.transformToWebStream === "function") return sdkBody.transformToWebStream();
  return body as BodyInit;
}

function contentDisposition(filename?: string) {
  return filename ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` : "inline";
}

function statusOf(error: unknown): number | undefined {
  if (error instanceof S3ServiceException) return error.$metadata.httpStatusCode;
  if (typeof error === "object" && error) {
    return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  }
  return undefined;
}

function isMissing(error: unknown) {
  if (statusOf(error) === 404) return true;
  const name = typeof error === "object" && error ? (error as { name?: string }).name : undefined;
  return name === "NoSuchKey" || name === "NotFound";
}

export class B2Storage {
  private readonly bucket: string;

  constructor(
    env: Pick<B2Env, "B2_BUCKET">,
    private readonly client: S3Sender,
  ) {
    this.bucket = env.B2_BUCKET;
  }

  async putObject(key: string, body: StorageBody, contentType: string) {
    const bytes = await bodyToBytes(body);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.byteLength,
        ContentType: contentType,
      }),
    );
  }

  async deleteKeys(keys: (string | null | undefined)[]) {
    const objects = [...new Set(keys.filter((key): key is string => !!key))].map((Key) => ({ Key }));
    if (!objects.length) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: objects, Quiet: true },
      }),
    );
  }

  async serveObject(
    key: string,
    request: Request,
    fallbackType = "application/octet-stream",
    filename?: string,
  ): Promise<Response> {
    try {
      let range: { offset: number; length: number } | null = null;
      const rangeHeader = request.headers.get("Range") ?? undefined;
      if (rangeHeader) {
        const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
        range = parseRange(rangeHeader, Number(head.ContentLength ?? 0));
      }

      const normalizedRange = range
        ? `bytes=${range.offset}-${range.offset + range.length - 1}`
        : undefined;
      const object = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: normalizedRange,
        }),
      );
      const length = Number(object.ContentLength ?? range?.length ?? 0);
      const headers = new Headers({
        "Content-Type": object.ContentType || fallbackType,
        "Content-Length": String(length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": contentDisposition(filename),
      });
      if (object.ETag) headers.set("ETag", object.ETag);
      if (object.ContentRange) headers.set("Content-Range", object.ContentRange);

      return new Response(responseBody(object.Body), {
        status: object.ContentRange ? 206 : 200,
        headers,
      });
    } catch (error) {
      if (isMissing(error)) throw Errors.notFound("Không tìm thấy file.");
      throw error;
    }
  }

  async startMultipart(key: string, contentType: string) {
    const created = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!created.UploadId) throw Errors.server("Backblaze B2 không trả về upload ID.");
    return new B2MultipartUpload(this.bucket, key, created.UploadId, this.client);
  }

  resumeMultipart(key: string, uploadId: string) {
    const rawUploadId = uploadId.startsWith("b2:") ? uploadId.slice(3) : uploadId;
    return new B2MultipartUpload(this.bucket, key, rawUploadId, this.client);
  }
}

export class B2MultipartUpload {
  readonly uploadId: string;

  constructor(
    private readonly bucket: string,
    private readonly key: string,
    private readonly rawUploadId: string,
    private readonly client: S3Sender,
  ) {
    // Prefixing IDs lets sessions opened on KV finish safely after B2 is enabled.
    this.uploadId = `b2:${rawUploadId}`;
  }

  async uploadPart(partNumber: number, body: ArrayBuffer | Uint8Array) {
    const bytes = await bodyToBytes(body);
    const uploaded = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: this.key,
        UploadId: this.rawUploadId,
        PartNumber: partNumber,
        Body: bytes,
        ContentLength: bytes.byteLength,
      }),
    );
    if (!uploaded.ETag) throw Errors.server("Backblaze B2 không trả về ETag của phần tải lên.");
    return { partNumber, etag: uploaded.ETag, size: bytes.byteLength };
  }

  async complete(parts: MpPart[]) {
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    if (!ordered.length || ordered.some((part, index) => part.partNumber !== index + 1 || part.size <= 0 || !part.etag)) {
      throw Errors.badRequest("Danh sách phần tải lên không hợp lệ.");
    }
    const completedParts: CompletedPart[] = ordered.map((part) => ({
      ETag: part.etag,
      PartNumber: part.partNumber,
    }));
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.key,
        UploadId: this.rawUploadId,
        MultipartUpload: { Parts: completedParts },
      }),
    );
  }

  async abort() {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.key,
        UploadId: this.rawUploadId,
      }),
    );
  }
}
