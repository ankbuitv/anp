import { Hono } from "hono";
import { idsSchema } from "@anp/validation";
import { TRASH_RETENTION_DAYS } from "@anp/shared";
import type { AppContext } from "../env";
import { ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { audit } from "../lib/audit";
import { deleteKeys } from "../lib/kv";
import { type MediaRow } from "../lib/media";

export const trashRoutes = new Hono<AppContext>();
trashRoutes.use("*", requireAuth);

trashRoutes.post("/restore", async (c) => {
  const { ids } = idsSchema.parse(await c.req.json());
  const ph = ids.map(() => "?").join(",");
  await c.env.DB.prepare(`UPDATE media SET deleted_at = NULL WHERE user_id = ? AND id IN (${ph})`)
    .bind(c.get("user")!.id, ...ids)
    .run();
  await audit(c, "restore", { entityType: "media", meta: { ids } });
  return ok(c, { restored: ids.length });
});

trashRoutes.post("/purge", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { ids?: string[]; all?: boolean };
  const user = c.get("user")!;
  let rows: MediaRow[] = [];
  if (body.all) {
    const res = await c.env.DB.prepare(`SELECT * FROM media WHERE user_id = ? AND deleted_at IS NOT NULL`)
      .bind(user.id)
      .all<MediaRow>();
    rows = res.results ?? [];
  } else {
    const ids = idsSchema.parse({ ids: body.ids ?? [] }).ids;
    const ph = ids.map(() => "?").join(",");
    const res = await c.env.DB.prepare(`SELECT * FROM media WHERE user_id = ? AND deleted_at IS NOT NULL AND id IN (${ph})`)
      .bind(user.id, ...ids)
      .all<MediaRow>();
    rows = res.results ?? [];
  }
  for (const r of rows) {
    await deleteKeys(c.env, [r.storage_key, r.thumb_key, r.preview_key]);
    await c.env.DB.prepare(`DELETE FROM media WHERE id = ?`).bind(r.id).run();
  }
  await audit(c, "purge", { entityType: "media", meta: { count: rows.length } });
  return ok(c, { purged: rows.length });
});

trashRoutes.get("/info", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) as n, IFNULL(SUM(size),0) as s FROM media WHERE user_id = ? AND deleted_at IS NOT NULL`,
  )
    .bind(c.get("user")!.id)
    .first<{ n: number; s: number }>();
  return ok(c, { count: row?.n ?? 0, bytes: row?.s ?? 0, retentionDays: TRASH_RETENTION_DAYS });
});
