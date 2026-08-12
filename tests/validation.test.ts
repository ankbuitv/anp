import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema, uploadInitSchema, pinSchema } from "@anp/validation";

describe("auth schemas", () => {
  it("rejects weak passwords and mismatched confirm", () => {
    const bad = registerSchema.safeParse({
      name: "An",
      email: "not-email",
      password: "short",
      confirmPassword: "x",
    });
    expect(bad.success).toBe(false);
    const ok = registerSchema.safeParse({
      name: "An",
      email: "an@example.com",
      password: "Secret123",
      confirmPassword: "Secret123",
    });
    expect(ok.success).toBe(true);
  });

  it("requires email on login", () => {
    expect(loginSchema.safeParse({ email: "x", password: "1" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "1" }).success).toBe(true);
  });

  it("validates pin and checksum", () => {
    expect(pinSchema.safeParse("123456").success).toBe(true);
    expect(pinSchema.safeParse("12ab56").success).toBe(false);
    expect(
      uploadInitSchema.safeParse({
        filename: "a.jpg",
        size: 12,
        mime: "image/jpeg",
        checksum: "a".repeat(64),
      }).success,
    ).toBe(true);
  });
});
