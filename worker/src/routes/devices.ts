import { Hono } from "hono";
import type { AppContext } from "../env";
import { Errors } from "../lib/errors";
import { ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { audit } from "../lib/audit";

export const deviceRoutes = new Hono<AppContext>();
deviceRoutes.use("*", requireAuth);

deviceRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const currentSid = c.get("sessionId");
  const devices = await c.env.DB.prepare(`SELECT * FROM devices WHERE user_id = ? ORDER BY last_active_at DESC`)
    .bind(user.id)
    .all<{
      id: string;
      name: string;
      type: "web" | "desktop" | "ios" | "android";
      platform: string | null;
      last_active_at: number;
      created_at: number;
    }>();
  const sessions = await c.env.DB.prepare(
    `SELECT id, device_id, user_agent, created_at, last_active_at, expires_at FROM sessions WHERE user_id = ? ORDER BY last_active_at DESC`,
  )
    .bind(user.id)
    .all<{
      id: string;
      device_id: string | null;
      user_agent: string | null;
      created_at: number;
      last_active_at: number;
      expires_at: number;
    }>();
  return ok(c, {
    devices: (devices.results ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      platform: d.platform,
      lastActiveAt: d.last_active_at,
      createdAt: d.created_at,
    })),
    sessions: (sessions.results ?? []).map((s) => ({
      id: s.id,
      deviceId: s.device_id,
      userAgent: s.user_agent,
      createdAt: s.created_at,
      lastActiveAt: s.last_active_at,
      current: s.id === currentSid,
    })),
  });
});

deviceRoutes.delete("/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(`SELECT id FROM sessions WHERE id = ? AND user_id = ?`)
    .bind(id, c.get("user")!.id)
    .first();
  if (!row) throw Errors.notFound();
  await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(id).run();
  await audit(c, "session_revoke", { entityType: "session", entityId: id });
  return ok(c, { revoked: true });
});

deviceRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare(`DELETE FROM sessions WHERE device_id = ? AND user_id = ?`).bind(id, c.get("user")!.id).run();
  await c.env.DB.prepare(`DELETE FROM devices WHERE id = ? AND user_id = ?`).bind(id, c.get("user")!.id).run();
  await audit(c, "device_revoke", { entityType: "device", entityId: id });
  return ok(c, { revoked: true });
});
