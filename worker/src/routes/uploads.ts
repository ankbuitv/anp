import { Hono } from "hono";
import { uploadInitSchema } from "@anp/validation";
import { CHUNK_SIZE, isAllowedMedia, mediaTypeFromMime, mimeFromName, objectKey, extOf } from "@anp/shared";
import type { AppContext } from "../env";
import { Errors } from "../lib/errors";
import { ok } from "../lib/http";
import { newId } from "../lib/crypto";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { albumsForMedia, getMedia, publicMedia, type MediaRow } from "../lib/media";
import { startMultipart, resumeMultipart, putObject } from "../lib/kv";
import { audit } from "../lib/audit";
import { notify } from "../lib/notify";
import { rebuildMoments } from "../lib/moments";

export const uploadRoutes = new Hono<AppContext>();
uploadRoutes.use("*", requireAuth);

type Part = { partNumber: number; etag: string; size: number };

function parseParts(raw: string | null): Part[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Part[];
  } catch {
    return [];
  }
}

uploadRoutes.post("/", rateLimit(120, 60_000, "up-init"), async (c) => {
  const body = uploadInitSchema.parse(await c.req.json());
  const mime = body.mime || mimeFromName(body.filename);
  if (!isAllowedMedia(mime, body.filename)) throw Errors.unsupported("Định dạng ảnh/video không được hỗ trợ.");
  const type = mediaTypeFromMime(mime);
  if (!type) throw Errors.unsupported();

  const user = c.get("user")!;
  const existing = await c.env.DB.prepare(
    `SELECT * FROM media WHERE user_id = ? AND checksum = ? AND deleted_at IS NULL LIMIT 1`,
  )
    .bind(user.id, body.checksum.toLowerCase())
    .first<MediaRow>();
  if (existing) {
    const albums = await albumsForMedia(c.env.DB, [existing.id]);
    return ok(c, { duplicate: true as const, media: publicMedia(existing, albums.get(existing.id) ?? []) });
  }

  const open = await c.env.DB.prepare(
    `SELECT * FROM upload_sessions WHERE user_id = ? AND checksum = ? AND status IN ('pending','uploading') LIMIT 1`,
  )
    .bind(user.id, body.checksum.toLowerCase())
    .first<{
      id: string;
      uploaded_parts: string | null;
      size: number;
      media_id: string | null;
    }>();
  if (open) {
    const parts = parseParts(open.uploaded_parts);
    return ok(c, {
      duplicate: false as const,
      uploadId: open.id,
      mediaId: open.media_id,
      strategy: "multipart" as const,
      chunkSize: CHUNK_SIZE,
      uploadedParts: parts.map((p) => p.partNumber),
    });
  }

  const mediaId = newId();
  const ext = extOf(body.filename) || (type === "video" ? "mp4" : "jpg");
  const key = objectKey(user.id, mediaId, "original", ext);
  const mp = await startMultipart(c.env.MEDIA, key, mime);
  const now = Date.now();
  const meta = {
    isPrivate: !!body.isPrivate,
    deviceId: body.deviceId ?? c.get("deviceId"),
    exif: body.exif ?? {},
    mediaType: type,
    originalName: body.filename,
  };
  await c.env.DB.prepare(
    `INSERT INTO upload_sessions
      (id, user_id, filename, size, mime, checksum, r2_key, storage_key, multipart_upload_id, status, uploaded_parts, uploaded_bytes, created_at, metadata_json, media_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '[]', 0, ?, ?, ?)`,
  )
    .bind(
      mediaId,
      user.id,
      body.filename,
      body.size,
      mime,
      body.checksum.toLowerCase(),
      key,
      key,
      mp.uploadId,
      now,
      JSON.stringify(meta),
      mediaId,
    )
    .run();

  // Use session id = mediaId for stable URLs; store multipart id separately
  // Re-read: we used mediaId as session id
  return ok(
    c,
    {
      duplicate: false as const,
      uploadId: mediaId,
      mediaId,
      strategy: "multipart" as const,
      chunkSize: CHUNK_SIZE,
      uploadedParts: [] as number[],
    },
    201,
  );
});

uploadRoutes.get("/:id", async (c) => {
  const row = await c.env.DB.prepare(`SELECT * FROM upload_sessions WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), c.get("user")!.id)
    .first<{
      id: string;
      status: string;
      uploaded_parts: string | null;
      uploaded_bytes: number;
      size: number;
      media_id: string | null;
    }>();
  if (!row) throw Errors.notFound("Phiên tải lên không tồn tại.");
  const parts = parseParts(row.uploaded_parts);
  return ok(c, {
    uploadId: row.id,
    status: row.status,
    uploadedParts: parts.map((p) => p.partNumber),
    uploadedBytes: row.uploaded_bytes,
    size: row.size,
    mediaId: row.media_id,
  });
});

uploadRoutes.put("/:id/parts/:n", rateLimit(600, 60_000, "up-part"), async (c) => {
  const n = Number(c.req.param("n"));
  if (!Number.isInteger(n) || n < 1 || n > 10_000) throw Errors.badRequest("Số phần không hợp lệ.");
  const row = await c.env.DB.prepare(`SELECT * FROM upload_sessions WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), c.get("user")!.id)
    .first<{
      id: string;
      status: string;
      storage_key: string;
      multipart_upload_id: string | null;
      uploaded_parts: string | null;
      uploaded_bytes: number;
      size: number;
    }>();
  if (!row || !row.multipart_upload_id) throw Errors.notFound("Phiên tải lên không tồn tại.");
  if (row.status === "completed") throw Errors.conflict("Đã hoàn tất.");
  if (row.status === "cancelled") throw Errors.gone("Phiên đã hủy.");

  const parts = parseParts(row.uploaded_parts);
  if (parts.some((p) => p.partNumber === n)) {
    return ok(c, { partNumber: n, skipped: true });
  }

  const buf = await c.req.arrayBuffer();
  if (buf.byteLength === 0) throw Errors.badRequest("Phần trống.");
  if (buf.byteLength > CHUNK_SIZE) throw Errors.payload("Phần vượt kích thước cho phép.");

  const mp = resumeMultipart(c.env.MEDIA, row.storage_key, row.multipart_upload_id);
  const uploaded = await mp.uploadPart(n, buf);
  parts.push({ partNumber: n, etag: uploaded.etag, size: uploaded.size });
  parts.sort((a, b) => a.partNumber - b.partNumber);
  const uploadedBytes = row.uploaded_bytes + buf.byteLength;
  await c.env.DB.prepare(
    `UPDATE upload_sessions SET status = 'uploading', uploaded_parts = ?, uploaded_bytes = ? WHERE id = ?`,
  )
    .bind(JSON.stringify(parts), uploadedBytes, row.id)
    .run();
  return ok(c, { partNumber: n, etag: uploaded.etag, uploadedBytes });
});

uploadRoutes.post("/:id/complete", async (c) => {
  const user = c.get("user")!;
  const row = await c.env.DB.prepare(`SELECT * FROM upload_sessions WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), user.id)
    .first<{
      id: string;
      status: string;
      filename: string;
      size: number;
      mime: string;
      checksum: string;
      storage_key: string;
      multipart_upload_id: string | null;
      uploaded_parts: string | null;
      metadata_json: string | null;
      media_id: string | null;
    }>();
  if (!row) throw Errors.notFound("Phiên tải lên không tồn tại.");
  if (row.status === "completed" && row.media_id) {
    const media = await getMedia(c.env.DB, row.media_id, user.id);
    if (media) return ok(c, { media: publicMedia(media) });
  }
  const parts = parseParts(row.uploaded_parts);
  if (!parts.length || !row.multipart_upload_id) throw Errors.badRequest("Chưa có dữ liệu tải lên.");
  if (parts.some((part, index) => part.partNumber !== index + 1 || !part.size)) {
    throw Errors.badRequest("Danh sách phần tải lên không hợp lệ.");
  }
  if (parts.reduce((total, part) => total + part.size, 0) !== row.size) {
    throw Errors.badRequest("Dữ liệu tải lên chưa đủ.");
  }

  const mp = resumeMultipart(c.env.MEDIA, row.storage_key, row.multipart_upload_id, row.mime);
  try {
    await mp.complete(parts);
  } catch {
    await c.env.DB.prepare(`UPDATE upload_sessions SET status = 'failed' WHERE id = ?`).bind(row.id).run();
    throw Errors.server("Không thể hoàn tất tải lên.");
  }

  const meta = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  const exif = meta.exif ?? {};
  const now = Date.now();
  const mediaId = row.media_id || row.id;
  const type = meta.mediaType || (row.mime.startsWith("video/") ? "video" : "image");

  await c.env.DB.prepare(
    `INSERT INTO media (
      id, user_id, filename, original_name, mime, media_type, size, width, height, duration,
      checksum, r2_key, storage_key, taken_at, uploaded_at, camera_make, camera_model, lens, iso, aperture,
      shutter_speed, focal_length, orientation, lat, lng, location_name, photographer,
      is_favorite, is_private, device_id, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)`,
  )
    .bind(
      mediaId,
      user.id,
      row.filename,
      meta.originalName || row.filename,
      row.mime,
      type,
      row.size,
      exif.width ?? null,
      exif.height ?? null,
      exif.duration ?? null,
      row.checksum,
      row.storage_key,
      row.storage_key,
      exif.takenAt ?? null,
      now,
      exif.cameraMake ?? null,
      exif.cameraModel ?? null,
      exif.lens ?? null,
      exif.iso ?? null,
      exif.aperture ?? null,
      exif.shutterSpeed ?? null,
      exif.focalLength ?? null,
      exif.orientation ?? null,
      exif.lat ?? null,
      exif.lng ?? null,
      exif.locationName ?? null,
      exif.photographer ?? null,
      meta.isPrivate ? 1 : 0,
      meta.deviceId ?? null,
    )
    .run();

  await c.env.DB.prepare(
    `INSERT INTO media_versions (id, media_id, version, r2_key, storage_key, checksum, size, metadata_json, created_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId(), mediaId, row.storage_key, row.storage_key, row.checksum, row.size, JSON.stringify({ source: "upload" }), now)
    .run();

  await c.env.DB.prepare(`UPDATE upload_sessions SET status = 'completed', completed_at = ?, media_id = ? WHERE id = ?`)
    .bind(now, mediaId, row.id)
    .run();

  await audit(c, "upload", { entityType: "media", entityId: mediaId, meta: { filename: row.filename, size: row.size } });
  c.executionCtx.waitUntil(rebuildMoments(c.env.DB, user.id));

  const media = await getMedia(c.env.DB, mediaId, user.id);
  return ok(c, { media: media ? publicMedia(media) : null });
});

uploadRoutes.put("/:id/thumb", async (c) => {
  const user = c.get("user")!;
  const mediaId = c.req.param("id");
  const media = await getMedia(c.env.DB, mediaId, user.id);
  const session = media
    ? null
    : await c.env.DB.prepare(`SELECT media_id FROM upload_sessions WHERE id = ? AND user_id = ?`)
        .bind(mediaId, user.id)
        .first<{ media_id: string | null }>();
  const id = media?.id || session?.media_id;
  if (!id) throw Errors.notFound();
  const kind = c.req.query("kind") === "preview" ? "preview" : "thumb";
  const ext = "jpg";
  const key = objectKey(user.id, id, kind, ext);
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > 8 * 1024 * 1024) throw Errors.payload();
  await putObject(c.env.MEDIA, key, buf, "image/jpeg");
  if (kind === "preview") {
    await c.env.DB.prepare(`UPDATE media SET preview_key = ?, preview_size = ? WHERE id = ? AND user_id = ?`)
      .bind(key, buf.byteLength, id, user.id)
      .run();
  } else {
    await c.env.DB.prepare(`UPDATE media SET thumb_key = ?, thumb_size = ? WHERE id = ? AND user_id = ?`)
      .bind(key, buf.byteLength, id, user.id)
      .run();
  }
  return ok(c, { key, size: buf.byteLength });
});

uploadRoutes.delete("/:id", async (c) => {
  const row = await c.env.DB.prepare(`SELECT * FROM upload_sessions WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), c.get("user")!.id)
    .first<{ id: string; storage_key: string; multipart_upload_id: string | null; status: string }>();
  if (!row) throw Errors.notFound();
  if (row.multipart_upload_id && row.status !== "completed") {
    try {
      await resumeMultipart(c.env.MEDIA, row.storage_key, row.multipart_upload_id).abort();
    } catch {}
  }
  await c.env.DB.prepare(`UPDATE upload_sessions SET status = 'cancelled' WHERE id = ?`).bind(row.id).run();
  return ok(c, { cancelled: true });
});

uploadRoutes.post("/notify-batch", async (c) => {
  const body = (await c.req.json()) as { ok: number; fail: number };
  const user = c.get("user")!;
  if (body.fail > 0) {
    await notify(c.env.DB, user.id, "upload_error", "Một số file tải lên lỗi", `${body.fail} file không tải được.`);
  } else {
    await notify(c.env.DB, user.id, "upload_done", "Tải lên hoàn tất", `${body.ok} file đã vào thư viện.`);
  }
  return ok(c, { success: true });
});
