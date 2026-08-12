import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { AppContext, AuthedUser } from "../env";
import { Errors } from "../lib/errors";
import { originAllowed } from "../lib/http";
import { sha256Hex } from "../lib/crypto";

const SESSION_COOKIE = "anp_session";
const VAULT_COOKIE = "anp_vault";

export { SESSION_COOKIE, VAULT_COOKIE };

export const loadSession = createMiddleware<AppContext>(async (c, next) => {
  c.set("user", null);
  c.set("sessionId", null);
  c.set("deviceId", null);
  c.set("vaultUnlocked", false);

  const raw =
    getCookie(c, SESSION_COOKIE) ||
    (c.req.header("authorization")?.toLowerCase().startsWith("bearer ")
      ? c.req.header("authorization")!.slice(7).trim()
      : null);

  if (raw) {
    const tokenHash = await sha256Hex(raw);
    const row = await c.env.DB.prepare(
      `SELECT s.id as sid, s.device_id as device_id, s.expires_at as expires_at,
              u.id as id, u.name as name, u.email as email, u.avatar_key as avatar_key,
              u.vault_pin_hash as vault_pin_hash, u.email_verified as email_verified, u.created_at as created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
      .bind(tokenHash)
      .first<{
        sid: string;
        device_id: string | null;
        expires_at: number;
        id: string;
        name: string;
        email: string;
        avatar_key: string | null;
        vault_pin_hash: string | null;
        email_verified: number;
        created_at: number;
      }>();

    if (row && row.expires_at > Date.now()) {
      const user: AuthedUser = {
        id: row.id,
        name: row.name,
        email: row.email,
        avatarKey: row.avatar_key,
        hasVaultPin: !!row.vault_pin_hash,
        emailVerified: row.email_verified === 1,
        createdAt: row.created_at,
      };
      c.set("user", user);
      c.set("sessionId", row.sid);
      c.set("deviceId", row.device_id);
      const now = Date.now();
      if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
        c.executionCtx.waitUntil(
          Promise.all([
            c.env.DB.prepare(`UPDATE sessions SET last_active_at = ? WHERE id = ?`).bind(now, row.sid).run(),
            row.device_id
              ? c.env.DB.prepare(`UPDATE devices SET last_active_at = ? WHERE id = ?`).bind(now, row.device_id).run()
              : Promise.resolve(),
          ]),
        );
      }

      const vaultRaw = getCookie(c, VAULT_COOKIE);
      if (vaultRaw) {
        const vh = await sha256Hex(vaultRaw);
        const vs = await c.env.DB.prepare(
          `SELECT id FROM vault_sessions WHERE token_hash = ? AND user_id = ? AND expires_at > ?`,
        )
          .bind(vh, user.id, now)
          .first();
        if (vs) c.set("vaultUnlocked", true);
      }
    }
  }

  await next();
});

export const requireAuth = createMiddleware<AppContext>(async (c, next) => {
  if (!c.get("user")) throw Errors.unauthorized();
  const method = c.req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    if (!originAllowed(c)) throw Errors.forbidden("Origin không hợp lệ.");
  }
  await next();
});

export const requireVault = createMiddleware<AppContext>(async (c, next) => {
  if (!c.get("user")) throw Errors.unauthorized();
  if (!c.get("vaultUnlocked")) throw Errors.forbidden("Private Vault đang khóa.");
  await next();
});
