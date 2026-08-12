import { createMiddleware } from "hono/factory";
import type { AppContext } from "../env";
import { Errors } from "../lib/errors";
import { clientIp } from "../lib/http";

type Bucket = { n: number; reset: number };
const buckets = new Map<string, Bucket>();

function take(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 20_000) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    }
    return true;
  }
  if (b.n >= limit) return false;
  b.n += 1;
  return true;
}

export function rateLimit(limit: number, windowMs: number, prefix: string) {
  return createMiddleware<AppContext>(async (c, next) => {
    const ip = clientIp(c) || "unknown";
    const user = c.get("user")?.id ?? "";
    const key = `${prefix}:${user}:${ip}`;
    if (!take(key, limit, windowMs)) throw Errors.rateLimited();
    await next();
  });
}
