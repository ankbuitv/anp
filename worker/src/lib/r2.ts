import { Errors } from "./errors";

export async function putObject(
  bucket: R2Bucket,
  key: string,
  body: ReadableStream | ArrayBuffer | Uint8Array | Blob,
  contentType: string,
) {
  await bucket.put(key, body, {
    httpMetadata: { contentType },
  });
}

export async function deleteKeys(bucket: R2Bucket, keys: (string | null | undefined)[]) {
  const list = keys.filter((k): k is string => !!k);
  await Promise.all(list.map((k) => bucket.delete(k)));
}

type RangeSpec = { offset: number; length?: number };

function parseRange(header: string | undefined, size: number): RangeSpec | null {
  if (!header) return null;
  const m = /bytes=(\d*)-(\d*)/.exec(header);
  if (!m) return null;
  const start = m[1] ? Number(m[1]) : NaN;
  const end = m[2] ? Number(m[2]) : NaN;
  if (Number.isFinite(start) && Number.isFinite(end)) {
    return { offset: start, length: end - start + 1 };
  }
  if (Number.isFinite(start)) {
    return { offset: start, length: Math.max(0, size - start) };
  }
  if (Number.isFinite(end)) {
    const length = end;
    return { offset: Math.max(0, size - length), length };
  }
  return null;
}

export async function serveObject(
  bucket: R2Bucket,
  key: string,
  request: Request,
  fallbackType = "application/octet-stream",
  filename?: string,
): Promise<Response> {
  const head = await bucket.head(key);
  if (!head) throw Errors.notFound("Không tìm thấy file.");

  const size = head.size;
  const type = head.httpMetadata?.contentType || fallbackType;
  const rangeHeader = request.headers.get("Range") ?? undefined;
  const range = parseRange(rangeHeader, size);

  const disposition = filename
    ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    : "inline";

  const common: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": disposition,
  };

  if (range) {
    const obj = await bucket.get(key, { range });
    if (!obj) throw Errors.notFound("Không tìm thấy file.");
    const start = range.offset;
    const length = range.length ?? obj.size;
    const end = start + length - 1;
    return new Response(obj.body, {
      status: 206,
      headers: {
        ...common,
        "Content-Length": String(obj.size),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
    });
  }

  const obj = await bucket.get(key);
  if (!obj) throw Errors.notFound("Không tìm thấy file.");
  return new Response(obj.body, {
    status: 200,
    headers: {
      ...common,
      "Content-Length": String(obj.size),
      ETag: obj.httpEtag,
    },
  });
}

export type MpPart = { partNumber: number; etag: string };

export function startMultipart(bucket: R2Bucket, key: string, contentType: string): Promise<R2MultipartUpload> {
  return bucket.createMultipartUpload(key, { httpMetadata: { contentType } });
}

export function resumeMultipart(bucket: R2Bucket, key: string, uploadId: string) {
  return bucket.resumeMultipartUpload(key, uploadId);
}
