import { Hono } from "hono";
import type { AppContext } from "../env";
import { ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";

export const activityRoutes = new Hono<AppContext>();
activityRoutes.use("*", requireAuth);

activityRoutes.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, action, entity_type, entity_id, meta_json, ip, created_at
     FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`,
  )
    .bind(c.get("user")!.id)
    .all<{
      id: string;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      meta_json: string | null;
      ip: string | null;
      created_at: number;
    }>();
  return ok(c, {
    items: (rows.results ?? []).map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      meta: r.meta_json ? JSON.parse(r.meta_json) : null,
      ip: r.ip,
      createdAt: r.created_at,
    })),
  });
});
