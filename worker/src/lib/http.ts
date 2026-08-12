import type { Context } from "hono";
import type { AppContext } from "../env";

export function ok<T>(c: Context<AppContext>, data: T, status: 200 | 201 = 200) {
  return c.json({ ok: true as const, data }, status);
}

export function emptyOk(c: Context<AppContext>) {
  return c.json({ ok: true as const, data: { success: true } });
}

export function cookieOpts(c: Context<AppContext>, maxAgeSec: number) {
  const url = c.req.url;
  const secure = url.startsWith("https://") || c.env.ENVIRONMENT === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

export function clientIp(c: Context<AppContext>): string | null {
  return c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export function originAllowed(c: Context<AppContext>): boolean {
  const origin = c.req.header("origin");
  if (!origin) return true;
  try {
    const reqHost = new URL(c.req.url).host;
    const originHost = new URL(origin).host;
    if (originHost === reqHost) return true;
    const app = c.env.APP_URL ? new URL(c.env.APP_URL).host : null;
    if (app && originHost === app) return true;
    if (c.env.ENVIRONMENT !== "production") {
      if (originHost.endsWith(".e2b.app") || originHost === "localhost:5173" || originHost.startsWith("127.0.0.1")) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function appBase(c: Context<AppContext>): string {
  if (c.env.APP_URL) return c.env.APP_URL.replace(/\/$/, "");
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

export function parseCursor(raw: string | undefined): { t: number; id: string } | null {
  if (!raw) return null;
  const [t, id] = raw.split("_");
  const n = Number(t);
  if (!id || !Number.isFinite(n)) return null;
  return { t: n, id };
}

export function makeCursor(t: number, id: string): string {
  return `${t}_${id}`;
}
