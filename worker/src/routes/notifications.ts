import { Hono } from "hono";
import type { AppContext } from "../env";
import { ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";

export const notificationRoutes = new Hono<AppContext>();
notificationRoutes.use("*", requireAuth);

notificationRoutes.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(c.get("user")!.id)
    .all<{
      id: string;
      type: string;
      title: string;
      body: string | null;
      data_json: string | null;
      read_at: number | null;
      created_at: number;
    }>();
  const unread = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND read_at IS NULL`,
  )
    .bind(c.get("user")!.id)
    .first<{ n: number }>();
  return ok(c, {
    unread: unread?.n ?? 0,
    items: (rows.results ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      data: r.data_json ? JSON.parse(r.data_json) : null,
      readAt: r.read_at,
      createdAt: r.created_at,
    })),
  });
});

notificationRoutes.post("/read", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { ids?: string[] };
  const now = Date.now();
  if (body.ids?.length) {
    const ph = body.ids.map(() => "?").join(",");
    await c.env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND id IN (${ph})`)
      .bind(now, c.get("user")!.id, ...body.ids)
      .run();
  } else {
    await c.env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`)
      .bind(now, c.get("user")!.id)
      .run();
  }
  return ok(c, { success: true });
});
