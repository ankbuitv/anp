import { Hono } from "hono";
import { albumCreateSchema, albumUpdateSchema, albumItemsSchema } from "@anp/validation";
import type { AppContext } from "../env";
import { Errors } from "../lib/errors";
import { ok } from "../lib/http";
import { newId } from "../lib/crypto";
import { requireAuth } from "../middleware/auth";
import { audit } from "../lib/audit";
import { getMedia, publicMedia, type MediaRow } from "../lib/media";

export const albumRoutes = new Hono<AppContext>();
albumRoutes.use("*", requireAuth);

async function albumPayload(db: D1Database, id: string, userId: string) {
  const a = await db
    .prepare(`SELECT * FROM albums WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<{
      id: string;
      name: string;
      description: string | null;
      cover_media_id: string | null;
      is_private: number;
      created_at: number;
      updated_at: number;
    }>();
  if (!a) return null;
  const count = await db
    .prepare(
      `SELECT COUNT(*) as n FROM album_items ai JOIN media m ON m.id = ai.media_id
       WHERE ai.album_id = ? AND m.deleted_at IS NULL`,
    )
    .bind(id)
    .first<{ n: number }>();
  let cover = a.cover_media_id;
  if (!cover) {
    const first = await db
      .prepare(
        `SELECT m.id FROM album_items ai JOIN media m ON m.id = ai.media_id
         WHERE ai.album_id = ? AND m.deleted_at IS NULL ORDER BY ai.added_at DESC LIMIT 1`,
      )
      .bind(id)
      .first<{ id: string }>();
    cover = first?.id ?? null;
  }
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    coverMediaId: cover,
    coverUrl: cover ? `/api/v1/media/${cover}/thumb` : null,
    isPrivate: !!a.is_private,
    mediaCount: count?.n ?? 0,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

albumRoutes.get("/", async (c) => {
  const rows = await c.env.DB.prepare(`SELECT id FROM albums WHERE user_id = ? ORDER BY updated_at DESC`)
    .bind(c.get("user")!.id)
    .all<{ id: string }>();
  const items = [];
  for (const r of rows.results ?? []) {
    const a = await albumPayload(c.env.DB, r.id, c.get("user")!.id);
    if (a) items.push(a);
  }
  return ok(c, { items });
});

albumRoutes.post("/", async (c) => {
  const body = albumCreateSchema.parse(await c.req.json());
  const id = newId();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO albums (id, user_id, name, description, is_private, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, c.get("user")!.id, body.name, body.description ?? null, body.isPrivate ? 1 : 0, now, now)
    .run();
  await audit(c, "album_create", { entityType: "album", entityId: id });
  return ok(c, { album: await albumPayload(c.env.DB, id, c.get("user")!.id) }, 201);
});

albumRoutes.get("/:id", async (c) => {
  const album = await albumPayload(c.env.DB, c.req.param("id"), c.get("user")!.id);
  if (!album) throw Errors.notFound("Không tìm thấy album.");
  return ok(c, { album });
});

albumRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const cur = await albumPayload(c.env.DB, id, c.get("user")!.id);
  if (!cur) throw Errors.notFound();
  const body = albumUpdateSchema.parse(await c.req.json());
  if (body.coverMediaId) {
    const m = await getMedia(c.env.DB, body.coverMediaId, c.get("user")!.id);
    if (!m) throw Errors.badRequest("Ảnh bìa không hợp lệ.");
  }
  await c.env.DB.prepare(
    `UPDATE albums SET name = ?, description = ?, cover_media_id = ?, is_private = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
  )
    .bind(
      body.name ?? cur.name,
      body.description === undefined ? cur.description : body.description,
      body.coverMediaId === undefined ? cur.coverMediaId : body.coverMediaId,
      body.isPrivate === undefined ? (cur.isPrivate ? 1 : 0) : body.isPrivate ? 1 : 0,
      Date.now(),
      id,
      c.get("user")!.id,
    )
    .run();
  return ok(c, { album: await albumPayload(c.env.DB, id, c.get("user")!.id) });
});

albumRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const cur = await albumPayload(c.env.DB, id, c.get("user")!.id);
  if (!cur) throw Errors.notFound();
  await c.env.DB.prepare(`DELETE FROM albums WHERE id = ? AND user_id = ?`).bind(id, c.get("user")!.id).run();
  await audit(c, "album_delete", { entityType: "album", entityId: id });
  return ok(c, { deleted: true });
});

albumRoutes.post("/:id/items", async (c) => {
  const id = c.req.param("id");
  const cur = await albumPayload(c.env.DB, id, c.get("user")!.id);
  if (!cur) throw Errors.notFound();
  const { mediaIds } = albumItemsSchema.parse(await c.req.json());
  const now = Date.now();
  for (const mid of mediaIds) {
    const m = await getMedia(c.env.DB, mid, c.get("user")!.id);
    if (!m || m.deleted_at) continue;
    await c.env.DB.prepare(`INSERT OR IGNORE INTO album_items (album_id, media_id, added_at) VALUES (?, ?, ?)`)
      .bind(id, mid, now)
      .run();
  }
  await c.env.DB.prepare(`UPDATE albums SET updated_at = ? WHERE id = ?`).bind(now, id).run();
  return ok(c, { album: await albumPayload(c.env.DB, id, c.get("user")!.id) });
});

albumRoutes.delete("/:id/items", async (c) => {
  const id = c.req.param("id");
  const cur = await albumPayload(c.env.DB, id, c.get("user")!.id);
  if (!cur) throw Errors.notFound();
  const { mediaIds } = albumItemsSchema.parse(await c.req.json());
  const ph = mediaIds.map(() => "?").join(",");
  await c.env.DB.prepare(`DELETE FROM album_items WHERE album_id = ? AND media_id IN (${ph})`)
    .bind(id, ...mediaIds)
    .run();
  await c.env.DB.prepare(`UPDATE albums SET updated_at = ? WHERE id = ?`).bind(Date.now(), id).run();
  return ok(c, { album: await albumPayload(c.env.DB, id, c.get("user")!.id) });
});

albumRoutes.get("/:id/media", async (c) => {
  const id = c.req.param("id");
  const cur = await albumPayload(c.env.DB, id, c.get("user")!.id);
  if (!cur) throw Errors.notFound();
  const rows = await c.env.DB.prepare(
    `SELECT m.* FROM album_items ai JOIN media m ON m.id = ai.media_id
     WHERE ai.album_id = ? AND m.deleted_at IS NULL
     ORDER BY COALESCE(m.taken_at, m.uploaded_at) DESC`,
  )
    .bind(id)
    .all<MediaRow>();
  return ok(c, { album: cur, items: (rows.results ?? []).map((r) => publicMedia(r)), nextCursor: null });
});
