import { describe, expect, it } from "vitest";
import { hasEmailProvider } from "../worker/src/lib/email";
import { cookieOpts, originAllowed } from "../worker/src/lib/http";
import type { Context } from "hono";
import type { AppContext } from "../worker/src/env";

function mockContext(url: string, headers: Record<string, string> = {}, env: Partial<AppContext["Bindings"]> = {}) {
  const reqHeaders = new Headers(headers);
  return {
    req: {
      url,
      header: (name: string) => reqHeaders.get(name) || undefined,
    },
    env: {
      ENVIRONMENT: "production",
      APP_URL: "https://p.ankb.qzz.io",
      ...env,
    },
  } as unknown as Context<AppContext>;
}

describe("auth helpers", () => {
  it("detects email providers correctly", () => {
    expect(hasEmailProvider({} as AppContext["Bindings"])).toBe(false);
    expect(hasEmailProvider({ EMAIL_PROVIDER: "none" } as AppContext["Bindings"])).toBe(false);
    expect(hasEmailProvider({ EMAIL_PROVIDER: "log" } as AppContext["Bindings"])).toBe(true);
    expect(hasEmailProvider({ RESEND_API_KEY: "re_123" } as AppContext["Bindings"])).toBe(true);
    expect(hasEmailProvider({ BREVO_API_KEY: "xkeysib-123" } as AppContext["Bindings"])).toBe(true);
    expect(hasEmailProvider({ MAILGUN_API_KEY: "key-123" } as AppContext["Bindings"])).toBe(false);
    expect(hasEmailProvider({ MAILGUN_API_KEY: "key-123", MAILGUN_DOMAIN: "mail.example.com" } as AppContext["Bindings"])).toBe(true);
  });

  it("cookieOpts only sets secure on HTTPS or proxied HTTPS", () => {
    const httpCtx = mockContext("http://localhost:5173/api/v1/auth/register");
    expect(cookieOpts(httpCtx, 3600).secure).toBe(false);

    const httpsCtx = mockContext("https://p.ankb.qzz.io/api/v1/auth/register");
    expect(cookieOpts(httpsCtx, 3600).secure).toBe(true);

    const proxiedHttps = mockContext("http://127.0.0.1:8787/api/v1/auth/register", {
      "x-forwarded-proto": "https",
    });
    expect(cookieOpts(proxiedHttps, 3600).secure).toBe(true);

    const cfHttps = mockContext("http://127.0.0.1:8787/api/v1/auth/register", {
      "cf-visitor": '{"scheme":"https"}',
    });
    expect(cookieOpts(cfHttps, 3600).secure).toBe(true);
  });

  it("originAllowed accepts matching origin, configured APP_URL, e2b preview, and localhost", () => {
    const sameOrigin = mockContext("https://p.ankb.qzz.io/api/v1/auth/login", {
      origin: "https://p.ankb.qzz.io",
    });
    expect(originAllowed(sameOrigin)).toBe(true);

    const previewOrigin = mockContext("http://127.0.0.1:8787/api/v1/auth/login", {
      origin: "https://5173-sandbox-xyz.e2b.app",
    });
    expect(originAllowed(previewOrigin)).toBe(true);

    const localOrigin = mockContext("http://127.0.0.1:8787/api/v1/auth/login", {
      origin: "http://localhost:5173",
    });
    expect(originAllowed(localOrigin)).toBe(true);

    const evilOrigin = mockContext("https://p.ankb.qzz.io/api/v1/auth/login", {
      origin: "https://attacker.example.com",
    });
    expect(originAllowed(evilOrigin)).toBe(false);
  });
});
