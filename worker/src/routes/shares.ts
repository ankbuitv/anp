import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { shareCreateSchema, shareUnlockSchema } from "@anp/validation";
import { parseShareCode } from "@anp/shared";
import type { Context } from "hono";
import type { AppContext } from "../env";
import { Errors } from "../lib/errors";
import { ok, appBase, cookieOpts, clientIp } from "../lib/http";
import { hashSecret, verifySecret, newId, randomHex, shareDisplayCode } from "../lib/crypto";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { audit } from "../lib/audit";
import { publicMedia, type MediaRow } from "../lib/media";

export const shareRoutes = new Hono<AppContext>();

function shareDto(
  row: {
    id: string;
    code: string;
    token: string;
    type: "album" | "media" | "selection";
    album_id: string | null;
    title: string | null;
    permission: "view" | "download";
    access_code_hash: string | null;
    expires_at: number | null;
    revoked_at: number | null;
    view_count: number;
    download_count: number;
    last_accessed_at: number | null;
    created_at: number;
  },
  base: string,
  itemCount = 0,
) {
  return {
    id: row.id,
    code: row.code,
    token: row.token,
    url: `${base}/s/${row.token}`,
    type: row.type,
    albumId: row.album_id,
    title: row.title,
    permission: row.permission,
    hasAccessCode: !!row.access_code_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    viewCount: row.view_count,
    downloadCount: row.download_count,
    lastAccessedAt: row.last_accessed_at,
    createdAt: row.created_at,
    itemCount,
  };
}

shareRoutes.get("/", requireAuth, async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM shares WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(c.get("user")!.id)
    .all<Parameters<typeof shareDto>[0]>();
  const base = appBase(c);
  const items = [];
  for (const r of rows.results ?? []) {
    const n = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM share_items WHERE share_id = ?`)
      .bind(r.id)
      .first<{ n: number }>();
    items.push(shareDto(r, base, n?.n ?? 0));
  }
  return ok(c, { items });
});

shareRoutes.post("/", requireAuth, async (c) => {
  const body = shareCreateSchema.parse(await c.req.json());
  const user = c.get("user")!;
  const id = newId();
  const token = randomHex(18);
  const code = shareDisplayCode();
  let accessHash: string | null = null;
  if (body.accessCode) {
    accessHash = (await hashSecret(parseShareCode(body.accessCode))).hash + ":" + (await hashSecret(parseShareCode(body.accessCode))).salt;
    const h = await hashSecret(parseShareCode(body.accessCode));
    accessHash = `${h.hash}:${h.salt}`;
  }
  const now = Date.now();
  const expires = body.expiresInDays ? now + body.expiresInDays * 86400_000 : null;
  let title = body.title ?? null;
  const mediaIds: string[] = [];

  if (body.type === "album") {
    if (!body.albumId) throw Errors.badRequest("Thiếu album.");
    const album = await c.env.DB.prepare(`SELECT id, name FROM albums WHERE id = ? AND user_id = ?`)
      .bind(body.albumId, user.id)
      .first<{ id: string; name: string }>();
    if (!album) throw Errors.notFound("Album không tồn tại.");
    title = title || album.name;
    const items = await c.env.DB.prepare(
      `SELECT media_id FROM album_items WHERE album_id = ?`,
    )
      .bind(album.id)
      .all<{ media_id: string }>();
    mediaIds.push(...(items.results ?? []).map((i) => i.media_id));
  } else {
    if (!body.mediaIds?.length) throw Errors.badRequest("Chọn ít nhất một media.");
    mediaIds.push(...body.mediaIds);
    title = title || (mediaIds.length === 1 ? "1 mục" : `${mediaIds.length} mục`);
  }

  await c.env.DB.prepare(
    `INSERT INTO shares (id, user_id, code, token, type, album_id, title, permission, access_code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, user.id, code, token, body.type, body.albumId ?? null, title, body.permission, accessHash, expires, now)
    .run();

  for (const mid of mediaIds) {
    const own = await c.env.DB.prepare(`SELECT id FROM media WHERE id = ? AND user_id = ?`).bind(mid, user.id).first();
    if (!own) continue;
    await c.env.DB.prepare(`INSERT OR IGNORE INTO share_items (share_id, media_id) VALUES (?, ?)`).bind(id, mid).run();
  }
  await audit(c, "share_create", { entityType: "share", entityId: id, meta: { type: body.type, permission: body.permission } });
  const row = await c.env.DB.prepare(`SELECT * FROM shares WHERE id = ?`).bind(id).first<Parameters<typeof shareDto>[0]>();
  return ok(c, { share: shareDto(row!, appBase(c), mediaIds.length) }, 201);
});

shareRoutes.delete("/:id", requireAuth, async (c) => {
  const row = await c.env.DB.prepare(`SELECT id FROM shares WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), c.get("user")!.id)
    .first();
  if (!row) throw Errors.notFound();
  await c.env.DB.prepare(`UPDATE shares SET revoked_at = ? WHERE id = ?`).bind(Date.now(), c.req.param("id")).run();
  await audit(c, "share_revoke", { entityType: "share", entityId: c.req.param("id") });
  return ok(c, { revoked: true });
});

async function loadPublicShare(c: Context<AppContext>, token: string) {
  const row = await c.env.DB.prepare(`SELECT * FROM shares WHERE token = ?`).bind(token).first<{
    id: string;
    user_id: string;
    code: string;
    token: string;
    type: "album" | "media" | "selection";
    album_id: string | null;
    title: string | null;
    permission: "view" | "download";
    access_code_hash: string | null;
    expires_at: number | null;
    revoked_at: number | null;
    view_count: number;
    download_count: number;
    last_accessed_at: number | null;
    created_at: number;
  }>();
  if (!row || row.revoked_at) throw Errors.notFound("Liên kết chia sẻ không tồn tại.");
  if (row.expires_at && row.expires_at < Date.now()) throw Errors.gone("Chia sẻ đã hết hạn.");
  return row;
}

async function isUnlocked(c: Context<AppContext>, shareId: string, hasCode: boolean) {
  if (!hasCode) return true;
  const cookie = getCookie(c, `anp_share_${shareId}`);
  return cookie === "1";
}

shareRoutes.get("/public/:token", rateLimit(60, 60_000, "share-get"), async (c) => {
  const row = await loadPublicShare(c, c.req.param("token"));
  const unlocked = await isUnlocked(c, row.id, !!row.access_code_hash);
  if (!unlocked) {
    return ok(c, {
      title: row.title || "ANP",
      permission: row.permission,
      expiresAt: row.expires_at,
      requiresCode: true,
      unlocked: false,
      photoCount: 0,
      videoCount: 0,
      items: [],
    });
  }
  const media = await c.env.DB.prepare(
    `SELECT m.* FROM share_items si JOIN media m ON m.id = si.media_id
     WHERE si.share_id = ? AND m.deleted_at IS NULL
     ORDER BY COALESCE(m.taken_at, m.uploaded_at) DESC`,
  )
    .bind(row.id)
    .all<MediaRow>();
  const items = (media.results ?? []).map((r) => {
    const p = publicMedia(r);
    p.thumbUrl += `?share=${row.token}`;
    p.previewUrl += `?share=${row.token}`;
    p.fileUrl += `?share=${row.token}`;
    return p;
  });
  await c.env.DB.prepare(`UPDATE shares SET view_count = view_count + 1, last_accessed_at = ? WHERE id = ?`)
    .bind(Date.now(), row.id)
    .run();
  return ok(c, {
    title: row.title || "ANP",
    permission: row.permission,
    expiresAt: row.expires_at,
    requiresCode: !!row.access_code_hash,
    unlocked: true,
    photoCount: items.filter((i) => i.mediaType === "image").length,
    videoCount: items.filter((i) => i.mediaType === "video").length,
    items,
    token: row.token,
  });
});

shareRoutes.post("/public/:token/unlock", rateLimit(20, 60_000, "share-unlock"), async (c) => {
  const row = await loadPublicShare(c, c.req.param("token"));
  if (!row.access_code_hash) return ok(c, { unlocked: true });
  const body = shareUnlockSchema.parse(await c.req.json());
  const [hash, salt] = row.access_code_hash.split(":");
  const input = parseShareCode(body.code);
  const okPin = salt && hash ? await verifySecret(input, hash, salt) : false;
  const okDisplay = parseShareCode(row.code) === input;
  if (!okPin && !okDisplay) throw Errors.forbidden("Mã truy cập không hợp lệ.");
  setCookie(c, `anp_share_${row.id}`, "1", cookieOpts(c, 7 * 86400));
  return ok(c, { unlocked: true });
});

shareRoutes.post("/public/:token/download/:mediaId", rateLimit(60, 60_000, "share-dl"), async (c) => {
  const row = await loadPublicShare(c, c.req.param("token"));
  if (row.permission !== "download") throw Errors.forbidden("Chia sẻ này không cho phép tải xuống.");
  const unlocked = await isUnlocked(c, row.id, !!row.access_code_hash);
  if (!unlocked) throw Errors.forbidden("Mã truy cập không hợp lệ.");
  await c.env.DB.prepare(`UPDATE shares SET download_count = download_count + 1 WHERE id = ?`).bind(row.id).run();
  void clientIp(c);
  return ok(c, { url: `/api/v1/media/${c.req.param("mediaId")}/file?share=${row.token}&dl=1` });
});
