import { Hono } from "hono";
import type { AppContext } from "../env";
import { ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { publicMedia, type MediaRow } from "../lib/media";

export const homeRoutes = new Hono<AppContext>();
homeRoutes.use("*", requireAuth);

homeRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const counts = await c.env.DB.prepare(
    `SELECT
      SUM(CASE WHEN media_type = 'image' AND deleted_at IS NULL AND is_private = 0 THEN 1 ELSE 0 END) as photos,
      SUM(CASE WHEN media_type = 'video' AND deleted_at IS NULL AND is_private = 0 THEN 1 ELSE 0 END) as videos,
      IFNULL(SUM(CASE WHEN deleted_at IS NULL THEN size ELSE 0 END),0) as bytes
     FROM media WHERE user_id = ?`,
  )
    .bind(user.id)
    .first<{ photos: number; videos: number; bytes: number }>();
  const albums = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM albums WHERE user_id = ?`)
    .bind(user.id)
    .first<{ n: number }>();
  const recent = await c.env.DB.prepare(
    `SELECT * FROM media WHERE user_id = ? AND deleted_at IS NULL AND is_private = 0 ORDER BY uploaded_at DESC LIMIT 12`,
  )
    .bind(user.id)
    .all<MediaRow>();
  const latest = await c.env.DB.prepare(
    `SELECT * FROM media WHERE user_id = ? AND deleted_at IS NULL AND is_private = 0
     ORDER BY COALESCE(taken_at, uploaded_at) DESC LIMIT 12`,
  )
    .bind(user.id)
    .all<MediaRow>();

  const now = new Date();
  const memRows = await c.env.DB.prepare(
    `SELECT * FROM media WHERE user_id = ? AND deleted_at IS NULL AND is_private = 0 AND taken_at IS NOT NULL LIMIT 4000`,
  )
    .bind(user.id)
    .all<MediaRow>();
  const byYear = new Map<number, MediaRow[]>();
  for (const r of memRows.results ?? []) {
    const d = new Date(r.taken_at!);
    if (d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && d.getFullYear() < now.getFullYear()) {
      const list = byYear.get(d.getFullYear()) ?? [];
      list.push(r);
      byYear.set(d.getFullYear(), list);
    }
  }
  const memories = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 3)
    .map(([year, list]) => ({
      year,
      yearsAgo: now.getFullYear() - year,
      count: list.length,
      items: list.slice(0, 8).map((r) => publicMedia(r)),
    }));

  return ok(c, {
    photoCount: counts?.photos ?? 0,
    videoCount: counts?.videos ?? 0,
    bytes: counts?.bytes ?? 0,
    albumCount: albums?.n ?? 0,
    recent: (recent.results ?? []).map((r) => publicMedia(r)),
    latest: (latest.results ?? []).map((r) => publicMedia(r)),
    memories,
  });
});
