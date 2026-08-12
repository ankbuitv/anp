#!/usr/bin/env node

import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createHash, randomUUID } from "node:crypto";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";

const HELP = `Chuyển media ANP từ Workers KV sang Backblaze B2.

Biến môi trường bắt buộc:
  ANP_TOKEN       Giá trị cookie anp_session (gửi dưới dạng Bearer; không ghi vào Git)
  B2_KEY_ID       ID của Application Key con, KHÔNG dùng master key
  B2_APP_KEY      Application Key con giới hạn trong bucket anp-media

Biến môi trường có mặc định:
  ANP_API_URL     https://p.ankb.qzz.io/api/v1
  B2_BUCKET       anp-media
  B2_ENDPOINT     https://s3.us-east-005.backblazeb2.com
  B2_REGION       us-east-005

Tùy chọn:
  --dry-run              Chỉ liệt kê, không cần B2 credentials
  --verify-only          Chỉ kiểm tra object đã có trên B2
  --overwrite            Ghi phiên bản B2 mới dù key đã tồn tại
  --include-private      Bao gồm Private Vault (cần ANP_VAULT_TOKEN)
  --include-trash        Bao gồm media trong thùng rác
  --concurrency=N        Số media chạy song song (mặc định 3)
  --max-items=N          Giới hạn media để test
  --kinds=a,b            original,thumb,preview (mặc định cả ba)
  --report=PATH          Ghi báo cáo JSON không chứa secrets
  --help                 Hiện trợ giúp

Ví dụ (sau khi export secrets an toàn trong shell hiện tại):
  node scripts/kv-to-b2.mjs --max-items=3
  node scripts/kv-to-b2.mjs

Không truyền secret trong argument và không ghi vào file trong repo.
`;

function parseArgs(argv) {
  const options = {
    dryRun: false,
    verifyOnly: false,
    overwrite: false,
    includePrivate: false,
    includeTrash: false,
    concurrency: 3,
    maxItems: Infinity,
    kinds: new Set(["original", "thumb", "preview"]),
    report: process.env.ANP_MIGRATION_REPORT || "",
    help: false,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--verify-only") options.verifyOnly = true;
    else if (arg === "--overwrite") options.overwrite = true;
    else if (arg === "--include-private") options.includePrivate = true;
    else if (arg === "--include-trash") options.includeTrash = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--concurrency=")) options.concurrency = positiveInt(arg.split("=")[1], "concurrency");
    else if (arg.startsWith("--max-items=")) options.maxItems = positiveInt(arg.split("=")[1], "max-items");
    else if (arg.startsWith("--report=")) options.report = arg.slice("--report=".length);
    else if (arg.startsWith("--kinds=")) {
      options.kinds = new Set(arg.slice("--kinds=".length).split(",").filter(Boolean));
      for (const kind of options.kinds) {
        if (!["original", "thumb", "preview"].includes(kind)) throw new Error(`Kind không hợp lệ: ${kind}`);
      }
      if (!options.kinds.size) throw new Error("--kinds không được để trống.");
    } else {
      throw new Error(`Tùy chọn không hợp lệ: ${arg}`);
    }
  }
  if (options.dryRun && options.verifyOnly) throw new Error("Không dùng đồng thời --dry-run và --verify-only.");
  return options;
}

function positiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`--${name} phải là số nguyên dương.`);
  return parsed;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường ${name}.`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

async function retry(label, operation, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = Math.min(10_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      console.warn(`[retry ${attempt}/${attempts - 1}] ${label}: ${errorText(error)}; chờ ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function makeConfig(options) {
  const apiBase = (process.env.ANP_API_URL || "https://p.ankb.qzz.io/api/v1").replace(/\/$/, "");
  const token = required("ANP_TOKEN");
  const config = {
    apiBase,
    token,
    vaultToken: process.env.ANP_VAULT_TOKEN?.trim() || "",
    bucket: process.env.B2_BUCKET?.trim() || "anp-media",
    endpoint: process.env.B2_ENDPOINT?.trim() || "https://s3.us-east-005.backblazeb2.com",
    region: process.env.B2_REGION?.trim() || "us-east-005",
    keyId: "",
    appKey: "",
  };
  if (!options.dryRun) {
    config.keyId = required("B2_KEY_ID");
    config.appKey = required("B2_APP_KEY");
    // A B2 master key ID is the short account ID. Bucket-scoped Application Key IDs are longer.
    if (config.keyId.length <= 12) {
      throw new Error("B2_KEY_ID có dạng master key. Hãy tạo Application Key con giới hạn bucket; script từ chối master key.");
    }
  }
  if (options.includePrivate && !config.vaultToken) {
    throw new Error("--include-private cần ANP_VAULT_TOKEN (cookie anp_vault còn hiệu lực).");
  }
  return config;
}

function authHeaders(config) {
  const headers = { Authorization: `Bearer ${config.token}` };
  if (config.vaultToken) headers.Cookie = `anp_vault=${config.vaultToken}`;
  return headers;
}

async function apiJson(config, path) {
  return retry(`GET ${path}`, async () => {
    const response = await fetch(new URL(path, `${config.apiBase}/`), { headers: authHeaders(config) });
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) await sleep(Math.min(retryAfter * 1000, 30_000));
      throw new Error(`API HTTP ${response.status}`);
    }
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`API HTTP ${response.status} không trả JSON hợp lệ.`);
    }
    if (!response.ok || !payload?.ok) {
      throw new Error(`API HTTP ${response.status}: ${payload?.error?.message || "request failed"}`);
    }
    return payload.data;
  });
}

async function fetchMedia(config, options) {
  const me = await apiJson(config, "auth/me");
  const userId = me?.user?.id;
  if (!userId) throw new Error("Không đọc được user ID từ /auth/me.");
  console.log(`API: ${config.apiBase}; user: ${userId}`);

  const scopes = options.includePrivate ? [{ private: "1" }] : [{}];
  if (options.includeTrash) scopes.push({ trash: "1" });
  const byId = new Map();

  for (const scope of scopes) {
    let cursor = "";
    let page = 0;
    do {
      const query = new URLSearchParams({ limit: "200", sort: "uploaded", ...scope });
      if (cursor) query.set("cursor", cursor);
      const data = await apiJson(config, `media?${query}`);
      if (!Array.isArray(data?.items)) throw new Error("Response /media thiếu data.items.");
      page += 1;
      for (const item of data.items) {
        if (!byId.has(item.id)) byId.set(item.id, item);
        if (byId.size >= options.maxItems) break;
      }
      cursor = byId.size >= options.maxItems ? "" : data.nextCursor || "";
      console.log(`Cursor scope ${JSON.stringify(scope)} trang ${page}: +${data.items.length}, tổng ${byId.size}`);
    } while (cursor);
    if (byId.size >= options.maxItems) break;
  }

  return { userId, items: [...byId.values()] };
}

function extension(name, fallback) {
  const index = String(name || "").lastIndexOf(".");
  const raw = index >= 0 ? String(name).slice(index + 1).toLowerCase() : fallback;
  return (raw || fallback || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
}

function objectsFor(item, userId, kinds) {
  const base = `u/${userId}/o/${item.id}`;
  const originalExt = extension(item.originalName, item.mediaType === "video" ? "mp4" : "jpg");
  const objects = [];
  if (kinds.has("original")) {
    objects.push({
      kind: "original",
      key: `${base}/original.${originalExt}`,
      url: item.fileUrl,
      contentType: item.mime || "application/octet-stream",
      expectedSize: Number(item.size),
      checksum: item.checksum,
    });
  }
  // Newer API versions expose these hints. With an older deployment, migrate both
  // conservatively because the media endpoint transparently falls back to another rendition.
  if (kinds.has("thumb") && item.hasThumb !== false) {
    objects.push({ kind: "thumb", key: `${base}/thumb.jpg`, url: item.thumbUrl, contentType: "image/jpeg" });
  }
  if (kinds.has("preview") && item.hasPreview !== false) {
    objects.push({ kind: "preview", key: `${base}/preview.jpg`, url: item.previewUrl, contentType: "image/jpeg" });
  }
  return objects;
}

function createB2(config) {
  return new S3Client({
    endpoint: config.endpoint.replace(/\/$/, ""),
    region: config.region,
    credentials: { accessKeyId: config.keyId, secretAccessKey: config.appKey },
    maxAttempts: 5,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function isNotFound(error) {
  if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return true;
  return error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound" || error?.name === "NoSuchKey";
}

async function headObject(client, bucket, key) {
  return retry(`B2 HEAD ${key}`, async () => {
    try {
      return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  });
}

async function download(config, object, destination) {
  return retry(`download ${object.kind} ${object.url}`, async () => {
    const response = await fetch(new URL(object.url, `${config.apiBase}/`), { headers: authHeaders(config) });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination, { flags: "w" }));
    const info = await stat(destination);
    const headerSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(headerSize) && headerSize >= 0 && info.size !== headerSize) {
      throw new Error(`tải thiếu byte: ${info.size}/${headerSize}`);
    }
    if (Number.isFinite(object.expectedSize) && object.expectedSize >= 0 && info.size !== object.expectedSize) {
      throw new Error(`size original sai: ${info.size}/${object.expectedSize}`);
    }
    return { size: info.size, contentType: response.headers.get("content-type") || object.contentType };
  });
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function migrateObject(context, item, object, tempDir) {
  const { client, config, options, counters } = context;
  if (options.dryRun) {
    counters.planned += 1;
    console.log(`[dry-run] ${object.key} <- ${object.url}`);
    return;
  }

  const existing = await headObject(client, config.bucket, object.key);
  if (options.verifyOnly) {
    if (!existing) throw new Error(`thiếu trên B2: ${object.key}`);
    if (Number.isFinite(object.expectedSize) && Number(existing.ContentLength) !== object.expectedSize) {
      throw new Error(`size B2 sai: ${object.key} (${existing.ContentLength}/${object.expectedSize})`);
    }
    counters.verified += 1;
    return;
  }
  if (existing && !options.overwrite) {
    if (Number.isFinite(object.expectedSize) && Number(existing.ContentLength) !== object.expectedSize) {
      throw new Error(`key đã tồn tại nhưng size sai: ${object.key}; chạy lại với --overwrite`);
    }
    counters.skipped += 1;
    console.log(`[skip] ${object.key} đã có trên B2 (${existing.ContentLength ?? "?"} bytes)`);
    return;
  }

  const tempPath = join(tempDir, `${item.id}-${object.kind}-${randomUUID()}.bin`);
  try {
    const downloaded = await download(config, object, tempPath);
    if (object.kind === "original" && /^[a-f0-9]{64}$/i.test(object.checksum || "")) {
      const digest = await sha256File(tempPath);
      if (digest.toLowerCase() !== object.checksum.toLowerCase()) {
        throw new Error(`SHA-256 original sai cho ${object.key}`);
      }
    }
    await retry(`B2 PUT ${object.key}`, () =>
      client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: object.key,
          Body: createReadStream(tempPath),
          ContentLength: downloaded.size,
          ContentType: downloaded.contentType,
          Metadata: { "anp-migrated-from": "workers-kv" },
        }),
      ),
    );
    const uploaded = await headObject(client, config.bucket, object.key);
    if (!uploaded || Number(uploaded.ContentLength) !== downloaded.size) {
      throw new Error(`xác minh sau upload thất bại: ${object.key}`);
    }
    counters.uploaded += 1;
    counters.bytes += downloaded.size;
    console.log(`[put] ${object.key} (${downloaded.size} bytes)`);
  } finally {
    await rm(tempPath, { force: true });
  }
}

async function runPool(items, concurrency, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }
  const config = makeConfig(options);
  const startedAt = new Date().toISOString();
  const { userId, items } = await fetchMedia(config, options);
  console.log(`Tìm thấy ${items.length} media. Bucket đích: ${config.bucket}.`);

  const client = options.dryRun ? null : createB2(config);
  const tempDir = await mkdtemp(join(tmpdir(), "anp-kv-to-b2-"));
  const counters = { planned: 0, uploaded: 0, skipped: 0, verified: 0, failed: 0, bytes: 0 };
  const failures = [];
  const context = { client, config, options, counters };

  try {
    await runPool(items, options.concurrency, async (item, index) => {
      const objects = objectsFor(item, userId, options.kinds);
      for (const object of objects) {
        try {
          await migrateObject(context, item, object, tempDir);
        } catch (error) {
          counters.failed += 1;
          const failure = { mediaId: item.id, kind: object.kind, key: object.key, error: errorText(error) };
          failures.push(failure);
          console.error(`[fail] ${failure.key}: ${failure.error}`);
        }
      }
      console.log(`[media ${index + 1}/${items.length}] ${item.id}`);
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    client?.destroy();
  }

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    apiBase: config.apiBase,
    bucket: config.bucket,
    endpoint: config.endpoint,
    mediaCount: items.length,
    ...counters,
    failures,
  };
  console.log("\nKết quả:", JSON.stringify(report, null, 2));
  if (options.report) {
    await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(`Đã ghi report: ${options.report}`);
  }
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Migration dừng: ${errorText(error)}`);
  process.exitCode = 1;
});
