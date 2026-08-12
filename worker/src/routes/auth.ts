import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  profileSchema,
  pinSchema,
  settingsSchema,
} from "@anp/validation";
import { LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS, SESSION_DAYS, VAULT_SESSION_MINUTES } from "@anp/shared";
import type { Context } from "hono";
import type { AppContext } from "../env";
import { Errors } from "../lib/errors";
import { ok } from "../lib/http";
import { cookieOpts, clientIp } from "../lib/http";
import { hashSecret, verifySecret, sha256Hex, randomHex, newId } from "../lib/crypto";
import { audit } from "../lib/audit";
import { notify } from "../lib/notify";
import { SESSION_COOKIE, VAULT_COOKIE } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";

export const authRoutes = new Hono<AppContext>();

function userPayload(u: {
  id: string;
  name: string;
  email: string;
  avatarKey?: string | null;
  avatar_key?: string | null;
  hasVaultPin?: boolean;
  vault_pin_hash?: string | null;
  createdAt?: number;
  created_at?: number;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarKey || u.avatar_key ? `/api/v1/me/avatar` : null,
    hasVaultPin: u.hasVaultPin ?? !!u.vault_pin_hash,
    createdAt: u.createdAt ?? u.created_at ?? 0,
  };
}

async function createSession(
  c: Context<AppContext>,
  userId: string,
  device?: { name?: string; type?: string; platform?: string },
) {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const expires = now + SESSION_DAYS * 86400 * 1000;
  const sid = newId();
  let deviceId: string | null = null;
  if (device?.name || device?.type) {
    deviceId = newId();
    await c.env.DB.prepare(
      `INSERT INTO devices (id, user_id, name, type, platform, last_active_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(deviceId, userId, device.name || "Trình duyệt", device.type || "web", device.platform || null, now, now)
      .run();
  }
  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, device_id, token_hash, user_agent, ip, created_at, last_active_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(sid, userId, deviceId, tokenHash, (c.req.header("user-agent") || "").slice(0, 240), clientIp(c), now, now, expires)
    .run();
  setCookie(c, SESSION_COOKIE, token, cookieOpts(c, SESSION_DAYS * 86400));
  return { sid, deviceId, token };
}

authRoutes.post("/register", rateLimit(8, 10 * 60_000, "reg"), async (c) => {
  const body = registerSchema.parse(await c.req.json());
  const exists = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(body.email.toLowerCase()).first();
  if (exists) throw Errors.conflict("Email đã được sử dụng.");
  const { hash, salt } = await hashSecret(body.password);
  const id = newId();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO users (id, name, email, password_hash, password_salt, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, body.name, body.email.toLowerCase(), hash, salt, now, now)
    .run();
  await c.env.DB.prepare(`INSERT INTO user_settings (user_id, theme, slideshow_seconds) VALUES (?, 'dark', 5)`)
    .bind(id)
    .run();
  await createSession(c, id, { name: "Trình duyệt", type: "web", platform: c.req.header("user-agent") || "" });
  await audit(c, "register", { userId: id, entityType: "user", entityId: id });
  await notify(c.env.DB, id, "welcome", "Chào mừng đến ANP", "Tải ảnh hoặc video đầu tiên để bắt đầu thư viện của bạn.");
  return ok(
    c,
    {
      user: userPayload({ id, name: body.name, email: body.email.toLowerCase(), created_at: now, hasVaultPin: false }),
    },
    201,
  );
});

authRoutes.post("/login", rateLimit(20, 10 * 60_000, "login"), async (c) => {
  const body = loginSchema.parse(await c.req.json());
  const email = body.email.toLowerCase();
  const ip = clientIp(c);
  const since = Date.now() - LOGIN_WINDOW_MS;
  const attempts = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM login_attempts WHERE email = ? AND success = 0 AND created_at > ?`,
  )
    .bind(email, since)
    .first<{ n: number }>();
  if ((attempts?.n ?? 0) >= LOGIN_MAX_ATTEMPTS) {
    throw Errors.rateLimited("Quá nhiều lần đăng nhập sai. Thử lại sau 15 phút.");
  }

  const user = await c.env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first<{
    id: string;
    name: string;
    email: string;
    password_hash: string;
    password_salt: string;
    avatar_key: string | null;
    vault_pin_hash: string | null;
    created_at: number;
  }>();

  const valid = user ? await verifySecret(body.password, user.password_hash, user.password_salt) : false;
  await c.env.DB.prepare(`INSERT INTO login_attempts (id, email, ip, success, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(newId(), email, ip, valid ? 1 : 0, Date.now())
    .run();

  if (!user || !valid) throw Errors.unauthorized("Email hoặc mật khẩu không đúng.");

  await createSession(c, user.id, {
    name: body.deviceName || "Trình duyệt",
    type: body.deviceType || "web",
    platform: body.platform || c.req.header("user-agent") || "",
  });
  await audit(c, "login", { userId: user.id, entityType: "user", entityId: user.id });
  return ok(c, { user: userPayload(user) });
});

authRoutes.post("/logout", requireAuth, async (c) => {
  const sid = c.get("sessionId");
  if (sid) await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sid).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  deleteCookie(c, VAULT_COOKIE, { path: "/" });
  await audit(c, "logout");
  return ok(c, { success: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const u = c.get("user")!;
  const settings = await c.env.DB.prepare(`SELECT theme, slideshow_seconds FROM user_settings WHERE user_id = ?`)
    .bind(u.id)
    .first<{ theme: "dark" | "light" | "system"; slideshow_seconds: number }>();
  return ok(c, {
    user: userPayload(u),
    vaultUnlocked: c.get("vaultUnlocked"),
    settings: {
      theme: settings?.theme ?? "dark",
      slideshowSeconds: settings?.slideshow_seconds ?? 5,
    },
  });
});

authRoutes.patch("/me", requireAuth, async (c) => {
  const body = profileSchema.parse(await c.req.json());
  await c.env.DB.prepare(`UPDATE users SET name = ?, updated_at = ? WHERE id = ?`)
    .bind(body.name, Date.now(), c.get("user")!.id)
    .run();
  const u = c.get("user")!;
  return ok(c, { user: userPayload({ ...u, name: body.name }) });
});

authRoutes.post("/password", requireAuth, async (c) => {
  const body = changePasswordSchema.parse(await c.req.json());
  const u = await c.env.DB.prepare(`SELECT password_hash, password_salt FROM users WHERE id = ?`)
    .bind(c.get("user")!.id)
    .first<{ password_hash: string; password_salt: string }>();
  if (!u || !(await verifySecret(body.currentPassword, u.password_hash, u.password_salt))) {
    throw Errors.forbidden("Mật khẩu hiện tại không đúng.");
  }
  const next = await hashSecret(body.password);
  await c.env.DB.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?`)
    .bind(next.hash, next.salt, Date.now(), c.get("user")!.id)
    .run();
  await audit(c, "password_change");
  return ok(c, { success: true });
});

authRoutes.patch("/settings", requireAuth, async (c) => {
  const body = settingsSchema.parse(await c.req.json());
  const cur = await c.env.DB.prepare(`SELECT theme, slideshow_seconds FROM user_settings WHERE user_id = ?`)
    .bind(c.get("user")!.id)
    .first<{ theme: string; slideshow_seconds: number }>();
  const theme = body.theme ?? cur?.theme ?? "dark";
  const ss = body.slideshowSeconds ?? cur?.slideshow_seconds ?? 5;
  await c.env.DB.prepare(
    `INSERT INTO user_settings (user_id, theme, slideshow_seconds) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, slideshow_seconds = excluded.slideshow_seconds`,
  )
    .bind(c.get("user")!.id, theme, ss)
    .run();
  return ok(c, { theme, slideshowSeconds: ss });
});

authRoutes.post("/vault/pin", requireAuth, async (c) => {
  const { pin, currentPin } = (await c.req.json()) as { pin: string; currentPin?: string };
  const parsed = pinSchema.parse(pin);
  const u = await c.env.DB.prepare(`SELECT vault_pin_hash, vault_pin_salt FROM users WHERE id = ?`)
    .bind(c.get("user")!.id)
    .first<{ vault_pin_hash: string | null; vault_pin_salt: string | null }>();
  if (u?.vault_pin_hash) {
    if (!currentPin || !(await verifySecret(currentPin, u.vault_pin_hash, u.vault_pin_salt || ""))) {
      throw Errors.forbidden("PIN hiện tại không đúng.");
    }
  }
  const next = await hashSecret(parsed);
  await c.env.DB.prepare(`UPDATE users SET vault_pin_hash = ?, vault_pin_salt = ?, updated_at = ? WHERE id = ?`)
    .bind(next.hash, next.salt, Date.now(), c.get("user")!.id)
    .run();
  await audit(c, "vault_pin_set");
  return ok(c, { success: true });
});

authRoutes.post("/vault/unlock", requireAuth, rateLimit(15, 10 * 60_000, "vault"), async (c) => {
  const { pin } = (await c.req.json()) as { pin: string };
  const parsed = pinSchema.parse(pin);
  const u = await c.env.DB.prepare(`SELECT vault_pin_hash, vault_pin_salt FROM users WHERE id = ?`)
    .bind(c.get("user")!.id)
    .first<{ vault_pin_hash: string | null; vault_pin_salt: string | null }>();
  if (!u?.vault_pin_hash || !u.vault_pin_salt) throw Errors.badRequest("Chưa thiết lập PIN.");
  if (!(await verifySecret(parsed, u.vault_pin_hash, u.vault_pin_salt))) {
    throw Errors.forbidden("PIN không đúng.");
  }
  const token = randomHex(24);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await c.env.DB.prepare(`INSERT INTO vault_sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(newId(), c.get("user")!.id, tokenHash, now, now + VAULT_SESSION_MINUTES * 60_000)
    .run();
  setCookie(c, VAULT_COOKIE, token, cookieOpts(c, VAULT_SESSION_MINUTES * 60));
  await audit(c, "vault_unlock");
  return ok(c, { unlocked: true, expiresIn: VAULT_SESSION_MINUTES * 60 });
});

authRoutes.post("/vault/lock", requireAuth, async (c) => {
  await c.env.DB.prepare(`DELETE FROM vault_sessions WHERE user_id = ?`).bind(c.get("user")!.id).run();
  deleteCookie(c, VAULT_COOKIE, { path: "/" });
  return ok(c, { unlocked: false });
});
