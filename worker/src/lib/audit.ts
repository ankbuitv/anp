import type { Context } from "hono";
import type { AppContext } from "../env";
import { newId } from "./crypto";
import { clientIp } from "./http";

export async function audit(
  c: Context<AppContext>,
  action: string,
  opts?: { entityType?: string; entityId?: string; meta?: Record<string, unknown>; userId?: string | null },
) {
  const userId = opts?.userId !== undefined ? opts.userId : c.get("user")?.id ?? null;
  try {
    await c.env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, meta_json, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId(),
        userId,
        action,
        opts?.entityType ?? null,
        opts?.entityId ?? null,
        opts?.meta ? JSON.stringify(opts.meta) : null,
        clientIp(c),
        (c.req.header("user-agent") || "").slice(0, 240),
        Date.now(),
      )
      .run();
  } catch (e) {
    console.warn("audit failed", e);
  }
}
