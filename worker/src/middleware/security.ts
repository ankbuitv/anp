import { createMiddleware } from "hono/factory";
import type { AppContext } from "../env";
import { newId } from "../lib/crypto";

export const securityHeaders = createMiddleware<AppContext>(async (c, next) => {
  c.set("requestId", newId());
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "SAMEORIGIN");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("X-Request-Id", c.get("requestId"));
  if (c.req.url.startsWith("https://")) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
});
