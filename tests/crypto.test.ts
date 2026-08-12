import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret, shareDisplayCode, dropCode, timingSafeEqual } from "../worker/src/lib/crypto";
import { buildZip } from "../worker/src/lib/zip";

describe("password hashing", () => {
  it("verifies and rejects", async () => {
    const { hash, salt } = await hashSecret("Secret123");
    expect(await verifySecret("Secret123", hash, salt)).toBe(true);
    expect(await verifySecret("wrongpass", hash, salt)).toBe(false);
  });
});

describe("codes", () => {
  it("formats share and drop codes", () => {
    expect(shareDisplayCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(dropCode()).toMatch(/^ANP-DROP-[A-Z2-9]{4}$/);
  });
  it("timingSafeEqual", () => {
    expect(timingSafeEqual("abcd", "abcd")).toBe(true);
    expect(timingSafeEqual("abcd", "abce")).toBe(false);
  });
});

describe("zip store", () => {
  it("builds a zip with local + central headers", () => {
    const data = new TextEncoder().encode("hello");
    const zip = buildZip([{ name: "README.txt", data }]);
    const sig = new DataView(zip.buffer, zip.byteOffset, 4).getUint32(0, true);
    expect(sig).toBe(0x04034b50);
    expect(zip.byteLength).toBeGreaterThan(30 + data.length);
  });
});
