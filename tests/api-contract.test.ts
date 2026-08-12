import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("API surface", () => {
  it("worker mounts the documented v1 routes", () => {
    const src = readFileSync(resolve(__dirname, "../worker/src/index.ts"), "utf8");
    for (const route of [
      "/auth",
      "/uploads",
      "/media",
      "/albums",
      "/shares",
      "/trash",
      "/storage",
      "/devices",
      "/backup",
      "/drop",
      "/notifications",
      "/activity",
    ]) {
      expect(src).toContain(`"${route}"`);
    }
  });

  it("schema has required tables", () => {
    const sql = readFileSync(resolve(__dirname, "../migrations/0001_init.sql"), "utf8");
    for (const t of [
      "users",
      "sessions",
      "media",
      "media_versions",
      "albums",
      "album_items",
      "shares",
      "share_items",
      "upload_sessions",
      "backup_sessions",
      "devices",
      "notifications",
      "audit_logs",
    ]) {
      expect(sql).toContain(`CREATE TABLE ${t}`);
    }
  });
});
