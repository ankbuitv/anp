import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";
import type { Env } from "../env";
import { ApiError, Errors } from "./errors";
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

/**
 * Cloudflare Workers' `fetch` is a method of the global object. Capturing it
 * (`const fn = fetch; fn()`) or calling it as `this.fetchFn()` after
 * `fetchFn = fetch` throws:
 *   TypeError: Illegal invocation: function called with incorrect `this` reference
 * Always call the global as a free function, or wrap it like this.
 */
function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

function createClient(env: B2Env) {
  const keyId = env.B2_KEY_ID.trim();
  const appKey = env.B2_APP_KEY.trim();
  // The master key ID is the short B2 account ID; bucket-scoped key IDs are longer.
  if (keyId.length <= 12) {
    throw Errors.server("B2_KEY_ID có dạng master key; hãy dùng Application Key con giới hạn bucket.");
  }
  return new S3Client({
    endpoint: env.B2_ENDPOINT.trim().replace(/\/$/, ""),
    region: env.B2_REGION?.trim() || regionFromEndpoint(env.B2_ENDPOINT),
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: appKey,
    },
    maxAttempts: 4,
    forcePathStyle: true,
    // Backblaze B2 does not require the newer automatic S3 checksum headers.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    // NodeHttpHandler extracts `https.request` and calls it without `this`.
    // On Workers that throws Illegal invocation; FetchHttpHandler uses global fetch.
    requestHandler: new FetchHttpHandler(),
  });
}

/** Gắn sẵn một B2Storage cho một env (dùng trong test để tránh gọi mạng thật). */
export function registerB2Storage(env: object, storage: B2Storage) {
  storageByEnv.set(env, storage);
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

function nameOf(error: unknown): string {
  if (typeof error === "object" && error) {
    const e = error as { name?: string; Code?: string; code?: string };
    return e.name || e.Code || e.code || "";
  }
  return "";
}

function rawMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error) {
    const e = error as { message?: string; Message?: string };
    return e.message || e.Message || "";
  }
  return "";
}

export const B2_KEY_PERMISSION_HINT =
  "Application Key giới hạn bucket cần quyền List/Read/Write/Delete trên anp-media. S3 List còn cần «Allow List All Bucket Names» (listAllBucketNames); trang Dung lượng đếm bằng Native API nên chỉ cần listFiles.";

/**
 * Đổi lỗi S3/B2 thành thông báo tiếng Việt nêu rõ nguyên nhân, để người dùng
 * biết phải sửa cấu hình nào thay vì chỉ thấy "Không thể tải file lên".
 */
export function b2ErrorMessage(error: unknown): string {
  const status = statusOf(error);
  const name = nameOf(error);
  const raw = rawMessage(error);
  if (/listFiles/i.test(raw) && (status === 401 || status === 403 || /unauthor/i.test(name))) {
    return "Application Key thiếu quyền listFiles nên không liệt kê được file trên B2.";
  }
  if (
    name === "InvalidAccessKeyId" ||
    name === "SignatureDoesNotMatch" ||
    name === "unauthorized" ||
    name === "bad_auth_token" ||
    name === "expired_auth_token" ||
    status === 401
  ) {
    return "Backblaze B2 từ chối khóa truy cập (B2_KEY_ID / B2_APP_KEY sai, hết hạn, hoặc đã bị thu hồi).";
  }
  if (name === "AccessDenied" || name === "access_denied" || status === 403) {
    if (/cannot access bucket/i.test(raw)) {
      return `Backblaze từ chối truy cập bucket (thường thiếu listAllBucketNames / listBuckets). ${B2_KEY_PERMISSION_HINT}`;
    }
    if (raw && !/^access denied$/i.test(raw)) return `Backblaze B2 từ chối truy cập: ${raw}`;
    return B2_KEY_PERMISSION_HINT;
  }
  if (name === "NoSuchBucket") return "Bucket B2 không tồn tại (kiểm tra B2_BUCKET).";
  if (name === "PermanentRedirect" || status === 301) {
    return "Endpoint B2 không khớp vùng của bucket (kiểm tra B2_ENDPOINT / B2_REGION).";
  }
  if (name === "EntityTooSmall") return "Phần multipart nhỏ hơn mức tối thiểu 5 MB của S3.";
  if (name === "NoSuchUpload") return "Phiên multipart trên B2 đã hết hạn hoặc bị hủy; hãy tải lại file.";
  if (status === 429 || name === "SlowDown") return "Backblaze B2 đang giới hạn tốc độ; thử lại sau ít phút.";
  if (status && status >= 500) return "Backblaze B2 đang lỗi tạm thời; thử lại sau ít phút.";
  if (/fetch failed|network|timeout|illegal invocation/i.test(raw)) return "Không kết nối được tới Backblaze B2.";
  return raw ? `Backblaze B2 báo lỗi: ${raw}` : "Backblaze B2 báo lỗi không xác định.";
}

/** Bọc lỗi B2 thành ApiError để client nhận đúng nguyên nhân. */
export function toB2ApiError(error: unknown, action: string) {
  if (error instanceof ApiError) return error;
  const message = `${action}: ${b2ErrorMessage(error)}`;
  return Errors.server(message);
}

type NativeBucketRef = {
  bucketId?: string;
  bucketName?: string;
  id?: string;
  name?: string | null;
};

type NativeSession = {
  accountId: string;
  apiUrl: string;
  authorizationToken: string;
  bucketId: string | null;
  bucketName: string | null;
  bucketNames: string[];
  capabilities: string[];
  namePrefix: string | null;
};

type NativeFile = {
  fileName?: string;
  contentLength?: number;
  size?: number;
  action?: string;
};

function bucketRefId(bucket: NativeBucketRef | null | undefined) {
  return bucket?.bucketId || bucket?.id || null;
}

function bucketRefName(bucket: NativeBucketRef | null | undefined) {
  return bucket?.bucketName || bucket?.name || null;
}

function nativeError(status: number, payload: { code?: string; message?: string } | null, fallback: string) {
  return Object.assign(new Error(payload?.message || fallback), {
    name: payload?.code || (status === 401 ? "unauthorized" : status === 403 ? "AccessDenied" : "B2NativeError"),
    $metadata: { httpStatusCode: status },
  });
}

export class B2Storage {
  private readonly bucket: string;
  private readonly keyId?: string;
  private readonly appKey?: string;
  private nativeAuth: Promise<NativeSession> | null = null;

  constructor(
    env: Pick<B2Env, "B2_BUCKET"> & Partial<Pick<B2Env, "B2_KEY_ID" | "B2_APP_KEY">>,
    private readonly client: S3Sender,
    private readonly fetchFn: typeof fetch = defaultFetch,
  ) {
    this.bucket = env.B2_BUCKET.trim();
    this.keyId = env.B2_KEY_ID?.trim();
    this.appKey = env.B2_APP_KEY?.trim();
  }

  /** Native B2 HTTP — never call the Workers `fetch` binding with the wrong `this`. */
  private http(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const fn = this.fetchFn;
    if (fn === fetch || fn === defaultFetch) return fetch(input, init);
    return fn(input, init);
  }

  async putObject(key: string, body: StorageBody, contentType: string) {
    const bytes = await bodyToBytes(body);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentLength: bytes.byteLength,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      throw toB2ApiError(error, "Không ghi được file lên Backblaze B2");
    }
  }

  async deleteKeys(keys: (string | null | undefined)[]) {
    const objects = [...new Set(keys.filter((key): key is string => !!key))].map((Key) => ({ Key }));
    if (!objects.length) return;
    try {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: objects, Quiet: true },
        }),
      );
    } catch (error) {
      // Một số key con của B2 chỉ cho phép DeleteObject đơn lẻ.
      if (statusOf(error) !== 403 && nameOf(error) !== "AccessDenied") {
        throw toB2ApiError(error, "Không xóa được file trên Backblaze B2");
      }
      for (const object of objects) {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: object.Key }));
      }
    }
  }

  /**
   * Kiểm tra credentials + đúng bucket. Dùng Native API (b2_authorize_account)
   * thay vì S3 ListObjectsV2: key giới hạn bucket thiếu listAllBucketNames
   * vẫn authorize được, trong khi S3 list trả 403 AccessDenied.
   */
  async check(prefix?: string): Promise<{ ok: true } | { ok: false; message: string }> {
    if (this.keyId && this.appKey) {
      try {
        const auth = await this.getNativeAuth();
        if (auth.bucketNames.length && !auth.bucketNames.includes(this.bucket)) {
          return {
            ok: false,
            message: `Application Key chỉ được phép trên bucket «${auth.bucketNames.join(", ")}», không phải «${this.bucket}».`,
          };
        }
        if (auth.namePrefix && prefix && !prefix.startsWith(auth.namePrefix) && !auth.namePrefix.startsWith(prefix)) {
          return {
            ok: false,
            message: `Application Key bị giới hạn prefix «${auth.namePrefix}», không đọc được «${prefix}».`,
          };
        }
        const caps = new Set(auth.capabilities);
        if (!caps.has("readFiles") && !caps.has("writeFiles") && !caps.has("listFiles")) {
          return { ok: false, message: B2_KEY_PERMISSION_HINT };
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, message: b2ErrorMessage(error) };
      }
    }
    try {
      await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: 1 }));
      return { ok: true };
    } catch (error) {
      return { ok: false, message: b2ErrorMessage(error) };
    }
  }

  /** Tổng số object và bytes thực tế đang nằm trong bucket B2. */
  async usage(prefix?: string): Promise<{ objects: number; bytes: number; truncated: boolean }> {
    // Native b2_list_file_names chỉ cần listFiles. S3 ListObjectsV2 hay 403/400
    // dù key đã có listAllBucketNames (SDK checksum, XML, "Cannot access bucket").
    if (this.keyId && this.appKey) {
      try {
        return await this.usageViaNative(prefix);
      } catch (nativeError) {
        try {
          return await this.usageViaS3(prefix);
        } catch {
          throw nativeError;
        }
      }
    }
    return this.usageViaS3(prefix);
  }

  private async usageViaS3(prefix?: string): Promise<{ objects: number; bytes: number; truncated: boolean }> {
    let objects = 0;
    let bytes = 0;
    let token: string | undefined;
    let pages = 0;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
      );
      for (const item of page.Contents ?? []) {
        objects += 1;
        bytes += Number(item.Size ?? 0);
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      pages += 1;
    } while (token && pages < 20);
    return { objects, bytes, truncated: !!token };
  }

  private async getNativeAuth(): Promise<NativeSession> {
    if (!this.keyId || !this.appKey) throw Errors.server("Thiếu B2_KEY_ID / B2_APP_KEY.");
    if (!this.nativeAuth) this.nativeAuth = this.authorizeNative();
    try {
      return await this.nativeAuth;
    } catch (error) {
      this.nativeAuth = null;
      throw error;
    }
  }

  private async authorizeNative(): Promise<NativeSession> {
    const token = btoa(`${this.keyId}:${this.appKey}`);
    // v4 hiểu cả key cũ lẫn Multi-Bucket key; v2/v3 từ chối key tạo bằng v4.
    const response = await this.http("https://api.backblazeb2.com/b2api/v4/b2_authorize_account", {
      headers: { Authorization: `Basic ${token}` },
    });
    const payload = (await response.json().catch(() => null)) as {
      accountId?: string;
      apiUrl?: string;
      authorizationToken?: string;
      code?: string;
      message?: string;
      allowed?: {
        bucketId?: string;
        bucketName?: string;
        capabilities?: string[];
        namePrefix?: string | null;
        buckets?: NativeBucketRef[] | null;
      };
      apiInfo?: {
        storageApi?: {
          apiUrl?: string;
          allowed?: {
            bucketId?: string;
            bucketName?: string;
            capabilities?: string[];
            namePrefix?: string | null;
            buckets?: NativeBucketRef[] | null;
          };
        };
      };
    } | null;
    const storageApi = payload?.apiInfo?.storageApi;
    const apiUrl = payload?.apiUrl || storageApi?.apiUrl;
    const allowed = payload?.allowed ?? storageApi?.allowed ?? {};
    if (!response.ok || !apiUrl || !payload?.authorizationToken) {
      throw nativeError(response.status, payload, `HTTP ${response.status}`);
    }
    const refs: NativeBucketRef[] = [];
    if (allowed.bucketId || allowed.bucketName) {
      refs.push({ bucketId: allowed.bucketId, bucketName: allowed.bucketName });
    }
    for (const bucket of allowed.buckets ?? []) refs.push(bucket);
    const scoped = refs.find((bucket) => bucketRefName(bucket) === this.bucket) ?? refs[0] ?? null;
    const bucketNames = [...new Set(refs.map(bucketRefName).filter((name): name is string => !!name))];
    return {
      accountId: payload.accountId || "",
      apiUrl: apiUrl.replace(/\/$/, ""),
      authorizationToken: payload.authorizationToken,
      bucketId: bucketRefId(scoped) || allowed.bucketId || null,
      bucketName: bucketRefName(scoped) || allowed.bucketName || null,
      bucketNames,
      capabilities: allowed.capabilities ?? [],
      namePrefix: allowed.namePrefix ?? null,
    };
  }

  private async resolveBucketId(auth: NativeSession): Promise<string> {
    if (auth.bucketId) return auth.bucketId;
    const response = await this.http(`${auth.apiUrl}/b2api/v4/b2_list_buckets`, {
      method: "POST",
      headers: {
        Authorization: auth.authorizationToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accountId: auth.accountId, bucketName: this.bucket }),
    });
    const payload = (await response.json().catch(() => null)) as {
      buckets?: NativeBucketRef[];
      code?: string;
      message?: string;
    } | null;
    const match = payload?.buckets?.find((bucket) => bucketRefName(bucket) === this.bucket);
    const bucketId = bucketRefId(match);
    if (!response.ok || !bucketId) {
      throw nativeError(response.status, payload, "Không xác định được bucketId B2.");
    }
    return bucketId;
  }

  private async usageViaNative(prefix?: string): Promise<{ objects: number; bytes: number; truncated: boolean }> {
    const auth = await this.getNativeAuth();
    const bucketId = await this.resolveBucketId(auth);
    let startFileName: string | undefined;
    let objects = 0;
    let bytes = 0;
    let pages = 0;
    let more = true;
    while (more && pages < 20) {
      const response = await this.http(`${auth.apiUrl}/b2api/v4/b2_list_file_names`, {
        method: "POST",
        headers: {
          Authorization: auth.authorizationToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bucketId,
          prefix: prefix || "",
          maxFileCount: 1000,
          ...(startFileName ? { startFileName } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        files?: NativeFile[];
        nextFileName?: string | null;
        code?: string;
        message?: string;
      } | null;
      if (!response.ok) {
        throw nativeError(response.status, payload, `HTTP ${response.status}`);
      }
      for (const file of payload?.files ?? []) {
        if (file.action && file.action !== "upload") continue;
        const name = file.fileName || "";
        if (prefix && !name.startsWith(prefix)) continue;
        objects += 1;
        bytes += Number(file.contentLength ?? file.size ?? 0);
      }
      pages += 1;
      if (payload?.nextFileName) startFileName = payload.nextFileName;
      else more = false;
    }
    return { objects, bytes, truncated: more };
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
      throw toB2ApiError(error, "Không đọc được file từ Backblaze B2");
    }
  }

  async startMultipart(key: string, contentType: string) {
    let created;
    try {
      created = await this.client.send(
        new CreateMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      throw toB2ApiError(error, "Không mở được phiên tải lên trên Backblaze B2");
    }
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
    let uploaded;
    try {
      uploaded = await this.client.send(
        new UploadPartCommand({
          Bucket: this.bucket,
          Key: this.key,
          UploadId: this.rawUploadId,
          PartNumber: partNumber,
          Body: bytes,
          ContentLength: bytes.byteLength,
        }),
      );
    } catch (error) {
      throw toB2ApiError(error, `Không tải được phần ${partNumber} lên Backblaze B2`);
    }
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
    try {
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: this.key,
          UploadId: this.rawUploadId,
          MultipartUpload: { Parts: completedParts },
        }),
      );
    } catch (error) {
      throw toB2ApiError(error, "Không hoàn tất được tải lên trên Backblaze B2");
    }
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
