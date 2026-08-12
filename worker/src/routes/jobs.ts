import { Hono } from "hono";
import { exportKey } from "@anp/shared";
import type { AppContext } from "../env";
import { Errors } from "../lib/errors";
import { ok } from "../lib/http";
import { newId } from "../lib/crypto";
import { requireAuth } from "../middleware/auth";
import { notify } from "../lib/notify";
import { audit } from "../lib/audit";
import { putObject, serveObject } from "../lib/kv";
import type { MediaRow } from "../lib/media";

export const jobRoutes = new Hono<AppContext>();
jobRoutes.use("*", requireAuth);

jobRoutes.get("/", async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`)
    .bind(c.get("user")!.id)
    .all<{
      id: string;
      type: string;
      status: string;
      progress: number;
      result_json: string | null;
      error: string | null;
      created_at: number;
      completed_at: number | null;
    }>();
  return ok(c, {
    items: (rows.results ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      progress: r.progress,
      result: r.result_json ? JSON.parse(r.result_json) : null,
      error: r.error,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    })),
  });
});

jobRoutes.post("/export", async (c) => {
  const body = (await c.req.json()) as { albumId?: string; scope?: "album" | "all" };
  const user = c.get("user")!;
  const id = newId();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO jobs (id, user_id, type, status, progress, payload_json, created_at)
     VALUES (?, ?, ?, 'queued', 0, ?, ?)`,
  )
    .bind(id, user.id, body.scope === "all" ? "export_all" : "export_album", JSON.stringify(body), now)
    .run();

  c.executionCtx.waitUntil(runExport(c.env, user.id, id, body.albumId, body.scope === "all"));
  await audit(c, "export", { entityType: "job", entityId: id });
  return ok(c, { id, status: "queued" }, 201);
});

jobRoutes.get("/:id/file", async (c) => {
  const job = await c.env.DB.prepare(`SELECT * FROM jobs WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), c.get("user")!.id)
    .first<{ storage_key: string | null; status: string }>();
  if (!job?.storage_key || job.status !== "completed") throw Errors.notFound("File xuất chưa sẵn sàng.");
  return serveObject(c.env.MEDIA, job.storage_key, c.req.raw, "application/zip", `ANP_Album_${new Date().toISOString().slice(0, 10)}.zip`);
});

async function runExport(env: AppContext["Bindings"], userId: string, jobId: string, albumId?: string, all?: boolean) {
  try {
    await env.DB.prepare(`UPDATE jobs SET status = 'running', progress = 5 WHERE id = ?`).bind(jobId).run();
    let rows: MediaRow[] = [];
    if (all) {
      const res = await env.DB.prepare(
        `SELECT * FROM media WHERE user_id = ? AND deleted_at IS NULL AND is_private = 0 LIMIT 2000`,
      )
        .bind(userId)
        .all<MediaRow>();
      rows = res.results ?? [];
    } else if (albumId) {
      const res = await env.DB.prepare(
        `SELECT m.* FROM album_items ai JOIN media m ON m.id = ai.media_id
         WHERE ai.album_id = ? AND m.user_id = ? AND m.deleted_at IS NULL LIMIT 2000`,
      )
        .bind(albumId, userId)
        .all<MediaRow>();
      rows = res.results ?? [];
    }
    const metadata = {
      exportedAt: new Date().toISOString(),
      count: rows.length,
      media: rows.map((r) => ({
        id: r.id,
        filename: r.original_name,
        mime: r.mime,
        size: r.size,
        checksum: r.checksum,
        takenAt: r.taken_at,
        lat: r.lat,
        lng: r.lng,
        cameraMake: r.camera_make,
        cameraModel: r.camera_model,
      })),
    };
    // Manifest JSON — ZIP đầy đủ original cần Durable Object / queue cho album rất lớn.
    // Phase 1: lưu manifest + danh sách signed/internal keys; client tải từng file hoặc dùng job file JSON.
    const key = exportKey(userId, jobId);
    const readme = `ANP EXPORT
==========
Ngày xuất: ${metadata.exportedAt}
Số media: ${metadata.count}

Original nằm trong thư mục Photos/ và Videos/ khi dùng ứng dụng Desktop,
hoặc tải từng file từ thư viện web.

File metadata.json mô tả toàn bộ media đã xuất.
`;
    const payload = JSON.stringify({ readme, metadata }, null, 2);
    await putObject(env.MEDIA, key, payload, "application/json");
    await env.DB.prepare(
      `UPDATE jobs SET status = 'completed', progress = 100, r2_key = ?, storage_key = ?, result_json = ?, completed_at = ? WHERE id = ?`,
    )
      .bind(key, key, JSON.stringify({ count: rows.length, download: `/api/v1/jobs/${jobId}/file` }), Date.now(), jobId)
      .run();
    await notify(env.DB, userId, "export_done", "Xuất dữ liệu hoàn tất", `${rows.length} mục đã sẵn sàng.`);
  } catch (e) {
    await env.DB.prepare(`UPDATE jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`)
      .bind(e instanceof Error ? e.message : "export failed", Date.now(), jobId)
      .run();
    await notify(env.DB, userId, "export_error", "Xuất dữ liệu lỗi", "Không thể hoàn tất việc xuất.");
  }
}
