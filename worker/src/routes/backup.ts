import { Hono } from "hono";
import { backupCreateSchema, backupItemSchema } from "@anp/validation";
import type { AppContext } from "../env";
import { Errors } from "../lib/errors";
import { ok } from "../lib/http";
import { newId } from "../lib/crypto";
import { requireAuth } from "../middleware/auth";
import { notify } from "../lib/notify";
import { audit } from "../lib/audit";

export const backupRoutes = new Hono<AppContext>();
backupRoutes.use("*", requireAuth);

backupRoutes.get("/", async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM backup_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`)
    .bind(c.get("user")!.id)
    .all<{
      id: string;
      device_id: string | null;
      status: string;
      total_files: number;
      completed_files: number;
      failed_files: number;
      skipped_files: number;
      bytes_total: number;
      bytes_done: number;
      created_at: number;
      updated_at: number;
    }>();
  return ok(c, {
    items: (rows.results ?? []).map((r) => ({
      id: r.id,
      deviceId: r.device_id,
      status: r.status,
      totalFiles: r.total_files,
      completedFiles: r.completed_files,
      failedFiles: r.failed_files,
      skippedFiles: r.skipped_files,
      bytesTotal: r.bytes_total,
      bytesDone: r.bytes_done,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

backupRoutes.post("/", async (c) => {
  const body = backupCreateSchema.parse(await c.req.json());
  const id = newId();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO backup_sessions (id, user_id, device_id, status, total_files, bytes_total, created_at, updated_at)
     VALUES (?, ?, ?, 'running', ?, ?, ?, ?)`,
  )
    .bind(id, c.get("user")!.id, body.deviceId ?? c.get("deviceId"), body.totalFiles ?? 0, body.bytesTotal ?? 0, now, now)
    .run();
  await audit(c, "backup_start", { entityType: "backup", entityId: id });
  return ok(c, { id, status: "running" }, 201);
});

backupRoutes.post("/:id/check", async (c) => {
  const session = await c.env.DB.prepare(`SELECT id FROM backup_sessions WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), c.get("user")!.id)
    .first();
  if (!session) throw Errors.notFound();
  const body = backupItemSchema.parse(await c.req.json());
  const existing = await c.env.DB.prepare(
    `SELECT id FROM media WHERE user_id = ? AND checksum = ? AND deleted_at IS NULL`,
  )
    .bind(c.get("user")!.id, body.checksum.toLowerCase())
    .first<{ id: string }>();
  return ok(c, { exists: !!existing, mediaId: existing?.id ?? null });
});

backupRoutes.post("/:id/progress", async (c) => {
  const user = c.get("user")!;
  const row = await c.env.DB.prepare(`SELECT * FROM backup_sessions WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), user.id)
    .first<{ id: string }>();
  if (!row) throw Errors.notFound();
  const body = (await c.req.json()) as {
    completedFiles?: number;
    failedFiles?: number;
    skippedFiles?: number;
    bytesDone?: number;
    totalFiles?: number;
    bytesTotal?: number;
    status?: string;
  };
  await c.env.DB.prepare(
    `UPDATE backup_sessions SET
      completed_files = COALESCE(?, completed_files),
      failed_files = COALESCE(?, failed_files),
      skipped_files = COALESCE(?, skipped_files),
      bytes_done = COALESCE(?, bytes_done),
      total_files = COALESCE(?, total_files),
      bytes_total = COALESCE(?, bytes_total),
      status = COALESCE(?, status),
      updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      body.completedFiles ?? null,
      body.failedFiles ?? null,
      body.skippedFiles ?? null,
      body.bytesDone ?? null,
      body.totalFiles ?? null,
      body.bytesTotal ?? null,
      body.status ?? null,
      Date.now(),
      row.id,
    )
    .run();
  return ok(c, { updated: true });
});

backupRoutes.post("/:id/complete", async (c) => {
  const user = c.get("user")!;
  const row = await c.env.DB.prepare(`SELECT * FROM backup_sessions WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), user.id)
    .first<{ id: string; completed_files: number; failed_files: number }>();
  if (!row) throw Errors.notFound();
  const body = (await c.req.json().catch(() => ({}))) as { status?: string };
  const status = body.status === "failed" ? "failed" : "completed";
  await c.env.DB.prepare(`UPDATE backup_sessions SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, Date.now(), row.id)
    .run();
  if (status === "completed") {
    await notify(c.env.DB, user.id, "backup_done", "Sao lưu hoàn tất", `${row.completed_files} file đã được sao lưu.`);
  } else {
    await notify(c.env.DB, user.id, "backup_error", "Sao lưu gặp lỗi", "Một phiên sao lưu không hoàn tất.");
  }
  await audit(c, "backup_complete", { entityType: "backup", entityId: row.id, meta: { status } });
  return ok(c, { status });
});
