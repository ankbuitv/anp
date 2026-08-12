import { Hono } from "hono";
import type { AppContext } from "../env";
import { ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { publicMedia, type MediaRow } from "../lib/media";
import { getB2Storage, isB2Configured } from "../lib/b2";

export const storageRoutes = new Hono<AppContext>();
storageRoutes.use("*", requireAuth);

storageRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const agg = await c.env.DB.prepare(
    `SELECT media_type as t, COUNT(*) as c, IFNULL(SUM(size),0) as s,
            IFNULL(SUM(IFNULL(thumb_size,0)),0) as th, IFNULL(SUM(IFNULL(preview_size,0)),0) as pr
     FROM media WHERE user_id = ? AND deleted_at IS NULL GROUP BY media_type`,
  )
    .bind(user.id)
    .all<{ t: string; c: number; s: number; th: number; pr: number }>();

  let images = { count: 0, bytes: 0 };
  let videos = { count: 0, bytes: 0 };
  const thumbs = { count: 0, bytes: 0 };
  for (const r of agg.results ?? []) {
    if (r.t === "video") videos = { count: r.c, bytes: r.s };
    else images = { count: r.c, bytes: r.s };
    thumbs.bytes += r.th + r.pr;
    thumbs.count += r.c;
  }
  const largest = await c.env.DB.prepare(
    `SELECT id, filename, size, media_type FROM media WHERE user_id = ? AND deleted_at IS NULL ORDER BY size DESC LIMIT 15`,
  )
    .bind(user.id)
    .all<{ id: string; filename: string; size: number; media_type: string }>();

  const totalBytes = images.bytes + videos.bytes + thumbs.bytes;

  // Dung lượng thật trên Backblaze B2 cho riêng prefix của người dùng.
  let backend: {
    provider: "b2" | "kv" | "none";
    bucket: string | null;
    healthy: boolean;
    message: string | null;
    objects: number | null;
    bytes: number | null;
    truncated: boolean;
  } = {
    provider: c.env.MEDIA ? "kv" : "none",
    bucket: null,
    healthy: !!c.env.MEDIA,
    message: c.env.MEDIA ? null : "Chưa cấu hình Backblaze B2 hoặc Workers KV.",
    objects: null,
    bytes: null,
    truncated: false,
  };
  if (isB2Configured(c.env)) {
    backend = {
      provider: "b2",
      bucket: c.env.B2_BUCKET ?? null,
      healthy: false,
      message: null,
      objects: null,
      bytes: null,
      truncated: false,
    };
    try {
      // getB2Storage ném lỗi khi credential sai dạng (vd. master key) — đó chính
      // là nguyên nhân upload hỏng, nên phải hiện ra thay vì làm sập trang.
      const storage = getB2Storage(c.env);
      const health = await storage.check();
      backend.healthy = health.ok;
      backend.message = health.ok ? null : health.message;
      if (health.ok) {
        try {
          const usage = await storage.usage(`u/${user.id}/`);
          backend.objects = usage.objects;
          backend.bytes = usage.bytes;
          backend.truncated = usage.truncated;
        } catch {
          // Thiếu quyền ListObjects vẫn không được chặn trang Dung lượng.
          backend.message = "Không đọc được danh sách object trên B2 (thiếu quyền List).";
        }
      }
    } catch (error) {
      backend.message = error instanceof Error ? error.message : "Không khởi tạo được kết nối Backblaze B2.";
    }
  }

  return ok(c, {
    images,
    videos,
    thumbs,
    other: { count: 0, bytes: 0 },
    total: { count: images.count + videos.count, bytes: totalBytes },
    backend,
    largest: (largest.results ?? []).map((r) => ({
      id: r.id,
      filename: r.filename,
      size: r.size,
      mediaType: r.media_type,
    })),
  });
});

storageRoutes.get("/cleanup", async (c) => {
  const user = c.get("user")!;
  const dups = await c.env.DB.prepare(
    `SELECT checksum, COUNT(*) as c, SUM(size) as s,
            GROUP_CONCAT(id) as ids
     FROM media WHERE user_id = ? AND deleted_at IS NULL AND is_private = 0
     GROUP BY checksum HAVING c > 1`,
  )
    .bind(user.id)
    .all<{ checksum: string; c: number; s: number; ids: string }>();

  const largeVideos = await c.env.DB.prepare(
    `SELECT * FROM media WHERE user_id = ? AND deleted_at IS NULL AND media_type = 'video' AND size > ?
     ORDER BY size DESC LIMIT 50`,
  )
    .bind(user.id, 1024 * 1024 * 1024)
    .all<MediaRow>();

  const largeFiles = await c.env.DB.prepare(
    `SELECT * FROM media WHERE user_id = ? AND deleted_at IS NULL AND size > ?
     ORDER BY size DESC LIMIT 50`,
  )
    .bind(user.id, 200 * 1024 * 1024)
    .all<MediaRow>();

  const unalbumed = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM media m
     WHERE m.user_id = ? AND m.deleted_at IS NULL AND m.is_private = 0
       AND NOT EXISTS (SELECT 1 FROM album_items ai WHERE ai.media_id = m.id)`,
  )
    .bind(user.id)
    .first<{ n: number }>();

  const trash = await c.env.DB.prepare(
    `SELECT COUNT(*) as n, IFNULL(SUM(size),0) as s FROM media WHERE user_id = ? AND deleted_at IS NOT NULL`,
  )
    .bind(user.id)
    .first<{ n: number; s: number }>();

  const yearAgo = Date.now() - 365 * 86400_000;
  const old = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM media WHERE user_id = ? AND deleted_at IS NULL AND COALESCE(taken_at, uploaded_at) < ?`,
  )
    .bind(user.id, yearAgo)
    .first<{ n: number }>();

  return ok(c, {
    duplicates: (dups.results ?? []).map((d) => ({
      checksum: d.checksum,
      count: d.c,
      size: d.s,
      ids: (d.ids || "").split(",").filter(Boolean),
    })),
    largeVideos: (largeVideos.results ?? []).map((r) => publicMedia(r)),
    largeFiles: (largeFiles.results ?? []).map((r) => publicMedia(r)),
    unalbumed: { count: unalbumed?.n ?? 0 },
    trash: { count: trash?.n ?? 0, bytes: trash?.s ?? 0 },
    old: { count: old?.n ?? 0 },
  });
});
