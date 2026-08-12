import { Hono } from "hono";
import { dropCreateSchema } from "@anp/validation";
import { DROP_TTL_MINUTES, dropKey, extOf, isAllowedMedia } from "@anp/shared";
import type { AppContext } from "../env";
import { Errors } from "../lib/errors";
import { ok } from "../lib/http";
import { dropCode, newId } from "../lib/crypto";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { putObject, serveObject } from "../lib/kv";
import { notify } from "../lib/notify";

export const dropRoutes = new Hono<AppContext>();

dropRoutes.get("/", requireAuth, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM drop_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`,
  )
    .bind(c.get("user")!.id)
    .all<{
      id: string;
      code: string;
      type: "send" | "receive";
      status: string;
      expires_at: number;
      created_at: number;
    }>();
  const items = [];
  for (const r of rows.results ?? []) {
    const files = await c.env.DB.prepare(`SELECT id, filename, size, mime, status FROM drop_files WHERE session_id = ?`)
      .bind(r.id)
      .all<{ id: string; filename: string; size: number; mime: string | null; status: string }>();
    items.push({
      id: r.id,
      code: r.code,
      type: r.type,
      status: r.status,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      files: files.results ?? [],
    });
  }
  return ok(c, { items });
});

dropRoutes.post("/", requireAuth, async (c) => {
  const body = dropCreateSchema.parse(await c.req.json());
  const id = newId();
  const code = dropCode();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO drop_sessions (id, user_id, code, type, status, expires_at, created_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?)`,
  )
    .bind(id, c.get("user")!.id, code, body.type, now + DROP_TTL_MINUTES * 60_000, now)
    .run();
  return ok(c, { id, code, type: body.type, expiresAt: now + DROP_TTL_MINUTES * 60_000 }, 201);
});

dropRoutes.get("/code/:code", rateLimit(40, 60_000, "drop-lookup"), async (c) => {
  const code = c.req.param("code").toUpperCase();
  const row = await c.env.DB.prepare(`SELECT * FROM drop_sessions WHERE code = ?`).bind(code).first<{
    id: string;
    code: string;
    type: string;
    status: string;
    expires_at: number;
    created_at: number;
  }>();
  if (!row) throw Errors.notFound("Không tìm thấy phiên ANP Drop.");
  if (row.expires_at < Date.now()) throw Errors.gone("Phiên Drop đã hết hạn.");
  const files = await c.env.DB.prepare(`SELECT id, filename, size, mime, status FROM drop_files WHERE session_id = ?`)
    .bind(row.id)
    .all();
  return ok(c, { id: row.id, code: row.code, type: row.type, status: row.status, expiresAt: row.expires_at, files: files.results ?? [] });
});

dropRoutes.post("/:id/files", rateLimit(60, 60_000, "drop-up"), async (c) => {
  const row = await c.env.DB.prepare(`SELECT * FROM drop_sessions WHERE id = ?`).bind(c.req.param("id")).first<{
    id: string;
    user_id: string | null;
    expires_at: number;
    status: string;
  }>();
  if (!row) throw Errors.notFound();
  if (row.expires_at < Date.now()) throw Errors.gone("Phiên Drop đã hết hạn.");
  const filename = c.req.header("x-filename") || "file";
  const mime = c.req.header("content-type") || "application/octet-stream";
  if (!isAllowedMedia(mime, filename)) throw Errors.unsupported();
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > 90 * 1024 * 1024) {
    throw Errors.payload("File Drop trên web tối đa 90 MB / file. Dùng Desktop cho file lớn hơn.");
  }
  const fid = newId();
  const key = dropKey(row.id, fid, extOf(filename));
  await putObject(c.env.MEDIA, key, buf, mime);
  await c.env.DB.prepare(
    `INSERT INTO drop_files (id, session_id, filename, size, mime, r2_key, storage_key, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?)`,
  )
    .bind(fid, row.id, filename, buf.byteLength, mime, key, key, Date.now())
    .run();
  await c.env.DB.prepare(`UPDATE drop_sessions SET status = 'transferring' WHERE id = ?`).bind(row.id).run();
  if (row.user_id) {
    await notify(c.env.DB, row.user_id, "drop_file", "ANP Drop nhận file", filename);
  }
  return ok(c, { id: fid, filename, size: buf.byteLength }, 201);
});

dropRoutes.get("/:id/files/:fid", async (c) => {
  const file = await c.env.DB.prepare(
    `SELECT f.*, s.expires_at FROM drop_files f JOIN drop_sessions s ON s.id = f.session_id
     WHERE f.id = ? AND f.session_id = ?`,
  )
    .bind(c.req.param("fid"), c.req.param("id"))
    .first<{ storage_key: string; filename: string; mime: string | null; expires_at: number }>();
  if (!file) throw Errors.notFound();
  if (file.expires_at < Date.now()) throw Errors.gone();
  return serveObject(c.env.MEDIA, file.storage_key, c.req.raw, file.mime || "application/octet-stream", file.filename);
});
