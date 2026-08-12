import { Hono } from "hono";
import { idsSchema, mediaPatchSchema } from "@anp/validation";
import type { Context } from "hono";
import type { AppContext } from "../env";
import { Errors } from "../lib/errors";
import { ok, makeCursor, parseCursor } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { albumsForMedia, getMedia, publicMedia, visibilitySql, type MediaRow } from "../lib/media";
import { serveObject } from "../lib/r2";
import { audit } from "../lib/audit";

export const mediaRoutes = new Hono<AppContext>();

async function hydrate(db: D1Database, rows: MediaRow[]) {
  const albums = await albumsForMedia(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => publicMedia(r, albums.get(r.id) ?? []));
}

mediaRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user")!;
  const type = c.req.query("type");
  const favorite = c.req.query("favorite");
  const q = c.req.query("q")?.trim();
  const from = c.req.query("from");
  const to = c.req.query("to");
  const albumId = c.req.query("albumId");
  const momentId = c.req.query("momentId");
  const recent = c.req.query("recent");
  const hasGps = c.req.query("hasGps");
  const includePrivate = c.req.query("private") === "1" && c.get("vaultUnlocked");
  const trash = c.req.query("trash") === "1";
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") || 80)));
  const cursor = parseCursor(c.req.query("cursor") || undefined);
  const sort = c.req.query("sort") === "uploaded" ? "uploaded_at" : "taken_at";

  const where: string[] = [`m.user_id = ?`];
  const binds: unknown[] = [user.id];

  if (trash) {
    where.push(`m.deleted_at IS NOT NULL`);
  } else if (c.req.query("private") === "1") {
    if (!c.get("vaultUnlocked")) throw Errors.forbidden("Private Vault đang khóa.");
    where.push(`m.deleted_at IS NULL AND m.is_private = 1`);
  } else {
    where.push(visibilitySql(includePrivate, "m"));
  }
  if (type === "image" || type === "video") {
    where.push(`m.media_type = ?`);
    binds.push(type);
  }
  if (favorite === "1") where.push(`m.is_favorite = 1`);
  if (hasGps === "1") where.push(`m.lat IS NOT NULL AND m.lng IS NOT NULL`);
  if (from) {
    const t = Date.parse(from);
    if (Number.isFinite(t)) {
      where.push(`COALESCE(m.taken_at, m.uploaded_at) >= ?`);
      binds.push(t);
    }
  }
  if (to) {
    const t = Date.parse(to);
    if (Number.isFinite(t)) {
      where.push(`COALESCE(m.taken_at, m.uploaded_at) < ?`);
      binds.push(t);
    }
  }
  if (recent) {
    const days = recent === "1" ? 1 : recent === "7" ? 7 : recent === "30" ? 30 : 7;
    where.push(`m.uploaded_at >= ?`);
    binds.push(Date.now() - days * 86400_000);
  }
  if (q) {
    where.push(
      `(m.filename LIKE ? OR m.original_name LIKE ? OR IFNULL(m.location_name,'') LIKE ? OR IFNULL(m.camera_model,'') LIKE ? OR IFNULL(m.camera_make,'') LIKE ?)`,
    );
    const like = `%${q.replace(/%/g, "")}%`;
    binds.push(like, like, like, like, like);
  }
  if (albumId) {
    where.push(`EXISTS (SELECT 1 FROM album_items ai WHERE ai.media_id = m.id AND ai.album_id = ?)`);
    binds.push(albumId);
  }
  if (momentId) {
    where.push(`m.moment_id = ?`);
    binds.push(momentId);
  }
  if (cursor) {
    where.push(`(COALESCE(m.${sort}, m.uploaded_at) < ? OR (COALESCE(m.${sort}, m.uploaded_at) = ? AND m.id < ?))`);
    binds.push(cursor.t, cursor.t, cursor.id);
  }

  const sql = `SELECT m.* FROM media m WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(m.${sort}, m.uploaded_at) DESC, m.id DESC LIMIT ?`;
  binds.push(limit + 1);
  const res = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<MediaRow>();
  const rows = res.results ?? [];
  const extra = rows.length > limit;
  const page = extra ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = extra && last ? makeCursor(last[sort] ?? last.uploaded_at, last.id) : null;
  return ok(c, { items: await hydrate(c.env.DB, page), nextCursor });
});

mediaRoutes.get("/map", requireAuth, async (c) => {
  const user = c.get("user")!;
  const includePrivate = c.req.query("private") === "1" && c.get("vaultUnlocked");
  const rows = await c.env.DB.prepare(
    `SELECT id, lat, lng, media_type, taken_at FROM media
     WHERE user_id = ? AND ${visibilitySql(includePrivate)} AND lat IS NOT NULL AND lng IS NOT NULL
     LIMIT 5000`,
  )
    .bind(user.id)
    .all<{ id: string; lat: number; lng: number; media_type: "image" | "video"; taken_at: number | null }>();
  return ok(c, {
    items: (rows.results ?? []).map((r) => ({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      mediaType: r.media_type,
      takenAt: r.taken_at,
      thumbUrl: `/api/v1/media/${r.id}/thumb`,
    })),
  });
});

mediaRoutes.get("/calendar", requireAuth, async (c) => {
  const user = c.get("user")!;
  const year = Number(c.req.query("year") || new Date().getUTCFullYear());
  const month = Number(c.req.query("month") || new Date().getUTCMonth() + 1);
  if (!year || month < 1 || month > 12) throw Errors.badRequest();
  const start = Date.parse(`${year}-${String(month).padStart(2, "0")}-01T00:00:00`);
  const end = month === 12 ? Date.parse(`${year + 1}-01-01T00:00:00`) : Date.parse(`${year}-${String(month + 1).padStart(2, "0")}-01T00:00:00`);
  const tzOffsetMin = Number(c.req.query("tz") || 0);
  const rows = await c.env.DB.prepare(
    `SELECT id, taken_at, uploaded_at, media_type, thumb_key FROM media
     WHERE user_id = ? AND deleted_at IS NULL AND is_private = 0
       AND COALESCE(taken_at, uploaded_at) >= ? AND COALESCE(taken_at, uploaded_at) < ?`,
  )
    .bind(user.id, start - 14 * 3600_000, end + 14 * 3600_000)
    .all<Pick<MediaRow, "id" | "taken_at" | "uploaded_at" | "media_type" | "thumb_key">>();

  const days = new Map<string, { date: string; count: number; photoCount: number; videoCount: number; coverUrl: string | null }>();
  for (const r of rows.results ?? []) {
    const t = (r.taken_at ?? r.uploaded_at) - tzOffsetMin * 60_000;
    const d = new Date(t);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const inMonth = key.startsWith(`${year}-${String(month).padStart(2, "0")}`);
    if (!inMonth) continue;
    const cur = days.get(key) ?? { date: key, count: 0, photoCount: 0, videoCount: 0, coverUrl: null };
    cur.count += 1;
    if (r.media_type === "video") cur.videoCount += 1;
    else cur.photoCount += 1;
    if (!cur.coverUrl) cur.coverUrl = `/api/v1/media/${r.id}/thumb`;
    days.set(key, cur);
  }
  return ok(c, { year, month, days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) });
});

mediaRoutes.get("/memories", requireAuth, async (c) => {
  const user = c.get("user")!;
  const now = new Date();
  const month = now.getMonth();
  const date = now.getDate();
  const rows = await c.env.DB.prepare(
    `SELECT * FROM media WHERE user_id = ? AND deleted_at IS NULL AND is_private = 0 AND taken_at IS NOT NULL`,
  )
    .bind(user.id)
    .all<MediaRow>();
  const byYear = new Map<number, MediaRow[]>();
  for (const r of rows.results ?? []) {
    const d = new Date(r.taken_at!);
    if (d.getMonth() === month && d.getDate() === date && d.getFullYear() < now.getFullYear()) {
      const list = byYear.get(d.getFullYear()) ?? [];
      list.push(r);
      byYear.set(d.getFullYear(), list);
    }
  }
  const items = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => ({
      year,
      yearsAgo: now.getFullYear() - year,
      count: list.length,
      items: list.slice(0, 40).map((r) => publicMedia(r)),
    }));
  return ok(c, { today: `${date}/${month + 1}`, items });
});

mediaRoutes.get("/duplicates", requireAuth, async (c) => {
  const user = c.get("user")!;
  const rows = await c.env.DB.prepare(
    `SELECT checksum, COUNT(*) as c, SUM(size) as s
     FROM media WHERE user_id = ? AND deleted_at IS NULL AND is_private = 0
     GROUP BY checksum HAVING c > 1`,
  )
    .bind(user.id)
    .all<{ checksum: string; c: number; s: number }>();
  const groups = [];
  for (const g of rows.results ?? []) {
    const items = await c.env.DB.prepare(
      `SELECT * FROM media WHERE user_id = ? AND checksum = ? AND deleted_at IS NULL ORDER BY uploaded_at ASC`,
    )
      .bind(user.id, g.checksum)
      .all<MediaRow>();
    groups.push({
      checksum: g.checksum,
      count: g.c,
      size: g.s,
      ids: (items.results ?? []).map((r) => r.id),
      items: (items.results ?? []).map((r) => publicMedia(r)),
    });
  }
  return ok(c, { groups, totalFiles: groups.reduce((a, g) => a + g.count, 0) });
});

mediaRoutes.get("/:id", async (c) => {
  const shareToken = c.req.query("share");
  const user = c.get("user");
  let row: MediaRow | null = null;
  if (user) {
    row = await getMedia(c.env.DB, c.req.param("id"), user.id);
    if (row && row.is_private && !c.get("vaultUnlocked") && !row.deleted_at) {
      throw Errors.forbidden("Private Vault đang khóa.");
    }
  }
  if (!row && shareToken) {
    const allowed = await c.env.DB.prepare(
      `SELECT m.* FROM media m
       JOIN share_items si ON si.media_id = m.id
       JOIN shares s ON s.id = si.share_id
       WHERE m.id = ? AND s.token = ? AND s.revoked_at IS NULL
         AND (s.expires_at IS NULL OR s.expires_at > ?) AND m.deleted_at IS NULL`,
    )
      .bind(c.req.param("id"), shareToken, Date.now())
      .first<MediaRow>();
    row = allowed;
  }
  if (!row) throw Errors.notFound("Không tìm thấy media.");
  if (!user && !shareToken) throw Errors.unauthorized();
  const albums = user ? await albumsForMedia(c.env.DB, [row.id]) : new Map();
  const versions = await c.env.DB.prepare(
    `SELECT id, version, size, checksum, created_at FROM media_versions WHERE media_id = ? ORDER BY version DESC`,
  )
    .bind(row.id)
    .all<{ id: string; version: number; size: number | null; checksum: string | null; created_at: number }>();
  return ok(c, {
    media: publicMedia(row, albums.get(row.id) ?? []),
    versions: (versions.results ?? []).map((v) => ({
      id: v.id,
      version: v.version,
      size: v.size,
      checksum: v.checksum,
      createdAt: v.created_at,
      current: v.version === row.version,
    })),
  });
});

mediaRoutes.patch("/:id", requireAuth, async (c) => {
  const row = await getMedia(c.env.DB, c.req.param("id"), c.get("user")!.id);
  if (!row) throw Errors.notFound();
  const body = mediaPatchSchema.parse(await c.req.json());
  const filename = body.filename ?? row.filename;
  const photographer = body.photographer === undefined ? row.photographer : body.photographer;
  const locationName = body.locationName === undefined ? row.location_name : body.locationName;
  const fav = body.isFavorite === undefined ? row.is_favorite : body.isFavorite ? 1 : 0;
  const priv = body.isPrivate === undefined ? row.is_private : body.isPrivate ? 1 : 0;
  if (priv && !c.get("vaultUnlocked") && body.isPrivate) throw Errors.forbidden("Mở Vault trước khi chuyển vào kho riêng.");
  await c.env.DB.prepare(
    `UPDATE media SET filename = ?, photographer = ?, location_name = ?, is_favorite = ?, is_private = ? WHERE id = ?`,
  )
    .bind(filename, photographer, locationName, fav, priv, row.id)
    .run();
  const next = await getMedia(c.env.DB, row.id, c.get("user")!.id);
  return ok(c, { media: next ? publicMedia(next) : null });
});

mediaRoutes.post("/batch/favorite", requireAuth, async (c) => {
  const { ids } = idsSchema.parse(await c.req.json());
  const flag = c.req.query("value") === "0" ? 0 : 1;
  const ph = ids.map(() => "?").join(",");
  await c.env.DB.prepare(`UPDATE media SET is_favorite = ? WHERE user_id = ? AND id IN (${ph})`)
    .bind(flag, c.get("user")!.id, ...ids)
    .run();
  return ok(c, { updated: ids.length, isFavorite: !!flag });
});

mediaRoutes.post("/batch/private", requireAuth, async (c) => {
  if (!c.get("vaultUnlocked")) throw Errors.forbidden("Private Vault đang khóa.");
  const { ids } = idsSchema.parse(await c.req.json());
  const flag = c.req.query("value") === "0" ? 0 : 1;
  const ph = ids.map(() => "?").join(",");
  await c.env.DB.prepare(`UPDATE media SET is_private = ? WHERE user_id = ? AND id IN (${ph})`)
    .bind(flag, c.get("user")!.id, ...ids)
    .run();
  return ok(c, { updated: ids.length });
});

mediaRoutes.post("/batch/delete", requireAuth, async (c) => {
  const { ids } = idsSchema.parse(await c.req.json());
  const now = Date.now();
  const ph = ids.map(() => "?").join(",");
  await c.env.DB.prepare(`UPDATE media SET deleted_at = ? WHERE user_id = ? AND id IN (${ph}) AND deleted_at IS NULL`)
    .bind(now, c.get("user")!.id, ...ids)
    .run();
  await audit(c, "trash", { entityType: "media", meta: { ids } });
  return ok(c, { deleted: ids.length });
});

async function fileHandler(c: Context<AppContext>, kind: "file" | "thumb" | "preview") {
  const id = c.req.param("id");
  if (!id) throw Errors.notFound("Không thể tải ảnh.");
  const row = await getMedia(c.env.DB, id);
  if (!row) throw Errors.notFound("Không thể tải ảnh.");
  const user = c.get("user");
  const shareToken = c.req.query("share");
  let allowed = false;
  if (user && user.id === row.user_id) {
    if (row.is_private && !c.get("vaultUnlocked") && !row.deleted_at) {
      throw Errors.forbidden("Private Vault đang khóa.");
    }
    allowed = true;
  } else if (shareToken) {
    const share = await c.env.DB.prepare(
      `SELECT s.id, s.revoked_at, s.expires_at, s.permission FROM shares s
       LEFT JOIN share_items si ON si.share_id = s.id
       WHERE s.token = ? AND (si.media_id = ? OR s.album_id IN (SELECT album_id FROM album_items WHERE media_id = ?))`,
    )
      .bind(shareToken, id, id)
      .first<{ id: string; revoked_at: number | null; expires_at: number | null; permission: string }>();
    if (!share || share.revoked_at) throw Errors.forbidden("Bạn không có quyền truy cập.");
    if (share.expires_at && share.expires_at < Date.now()) throw Errors.gone("Chia sẻ đã hết hạn.");
    if (kind === "file" && share.permission !== "download" && c.req.query("dl") === "1") {
      throw Errors.forbidden("Chia sẻ này không cho phép tải xuống.");
    }
    allowed = true;
  }
  if (!allowed) throw Errors.unauthorized();

  const download = c.req.query("dl") === "1";
  if (kind === "file") {
    return serveObject(c.env.BUCKET, row.r2_key, c.req.raw, row.mime, download ? row.original_name : undefined);
  }
  const key = kind === "preview" ? row.preview_key || row.thumb_key || row.r2_key : row.thumb_key || row.preview_key || row.r2_key;
  return serveObject(c.env.BUCKET, key, c.req.raw, "image/jpeg");
}

mediaRoutes.get("/:id/file", async (c) => fileHandler(c, "file"));
mediaRoutes.get("/:id/thumb", async (c) => fileHandler(c, "thumb"));
mediaRoutes.get("/:id/preview", async (c) => fileHandler(c, "preview"));
