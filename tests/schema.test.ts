import { describe, expect, it, beforeEach } from "vitest";
import {
  ensureSchema,
  resetSchemaCache,
  isMissingColumn,
  isMissingTable,
  isSchemaError,
} from "../worker/src/lib/schema";
import { publicUnhandledMessage, zodErrorMessage } from "../worker/src/lib/errors";
import { insertUser, markEmailVerified, pendingVerificationId } from "../worker/src/lib/users";

type ColMap = Record<string, string[]>;

function createMockDb(opts: { columns: ColMap; failPragma?: boolean; missingTables?: string[] }) {
  const sqls: string[] = [];
  const db = {
    prepare(sql: string) {
      const stmt = {
        bind(..._args: unknown[]) {
          return stmt;
        },
        async all() {
          sqls.push(sql);
          if (opts.failPragma && /PRAGMA/i.test(sql)) throw new Error("no pragma");
          const m = /PRAGMA table_info\((\w+)\)/i.exec(sql);
          if (m) return { results: (opts.columns[m[1]] ?? []).map((name) => ({ name })) };
          return { results: [] };
        },
        async first() {
          sqls.push(sql);
          if (/FROM email_verifications/i.test(sql) && opts.missingTables?.includes("email_verifications")) {
            throw new Error("D1_ERROR: no such table: email_verifications");
          }
          return null;
        },
        async run() {
          sqls.push(sql);
          const alter = /ALTER TABLE (\w+) ADD COLUMN (\w+)/i.exec(sql);
          if (alter) {
            const table = alter[1]!;
            const col = alter[2]!;
            if (opts.missingTables?.includes(table)) throw new Error(`D1_ERROR: no such table: ${table}`);
            const cols = opts.columns[table] ?? (opts.columns[table] = []);
            if (cols.includes(col)) throw new Error(`duplicate column name: ${col}`);
            cols.push(col);
          }
          if (/INSERT INTO users/.test(sql) && /email_verified/.test(sql) && !opts.columns.users?.includes("email_verified")) {
            throw new Error("D1_ERROR: no such column: email_verified");
          }
          if (/UPDATE users SET email_verified/.test(sql) && !opts.columns.users?.includes("email_verified")) {
            throw new Error("D1_ERROR: no such column: email_verified");
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return { db: db as unknown as D1Database, sqls, columns: opts.columns };
}

describe("schema helpers", () => {
  beforeEach(() => resetSchemaCache());

  it("detects missing column/table and schema errors", () => {
    expect(isMissingColumn(new Error("D1_ERROR: no such column: email_verified"), "email_verified")).toBe(true);
    expect(isMissingColumn(new Error("D1_ERROR: no such column: storage_key"), "email_verified")).toBe(false);
    expect(isMissingTable(new Error("no such table: email_verifications"), "email_verifications")).toBe(true);
    expect(isSchemaError(new Error("SQLITE_ERROR: no such column: x"))).toBe(true);
    expect(isSchemaError(new Error("random"))).toBe(false);
  });

  it("adds email_verified and storage_key when missing", async () => {
    const { db, columns } = createMockDb({
      columns: {
        users: ["id", "name", "email"],
        media: ["id", "r2_key"],
        media_versions: ["id", "r2_key"],
        upload_sessions: ["id", "r2_key"],
        jobs: ["id", "r2_key"],
        drop_files: ["id", "r2_key"],
      },
    });
    await ensureSchema(db);
    expect(columns.users).toContain("email_verified");
    expect(columns.media).toContain("storage_key");
    expect(columns.upload_sessions).toContain("storage_key");
  });

  it("is idempotent when columns already exist", async () => {
    const { db, sqls } = createMockDb({
      columns: {
        users: ["id", "email_verified"],
        media: ["id", "storage_key"],
        media_versions: ["id", "storage_key"],
        upload_sessions: ["id", "storage_key"],
        jobs: ["id", "storage_key"],
        drop_files: ["id", "storage_key"],
      },
    });
    await ensureSchema(db);
    expect(sqls.some((s) => /ALTER TABLE/.test(s))).toBe(false);
  });

  it("insertUser falls back when email_verified column is missing", async () => {
    const { db } = createMockDb({ columns: { users: ["id", "name", "email"] } });
    await insertUser(db, {
      id: "u1",
      name: "An",
      email: "an@example.com",
      passwordHash: "h",
      passwordSalt: "s",
      emailVerified: true,
      now: 1,
    });
    await markEmailVerified(db, "u1");
    expect(await pendingVerificationId(db, "u1")).toBeNull();
  });

  it("pendingVerificationId returns null when table is missing", async () => {
    const { db } = createMockDb({ columns: { users: ["id"] }, missingTables: ["email_verifications"] });
    expect(await pendingVerificationId(db, "u1")).toBeNull();
  });
});

describe("error mapping", () => {
  it("duck-types ZodError so duplicate zod copies still become 400", () => {
    expect(zodErrorMessage({ name: "ZodError", issues: [{ message: "Email không hợp lệ." }] })).toBe(
      "Email không hợp lệ.",
    );
    expect(zodErrorMessage(new Error("boom"))).toBeNull();
  });

  it("turns D1 schema failures into actionable Vietnamese messages", () => {
    expect(publicUnhandledMessage(new Error("D1_ERROR: no such column: email_verified"))).toMatch(/email_verified/);
    expect(publicUnhandledMessage(new Error("no such table: email_verifications"))).toMatch(/email_verifications/);
    expect(publicUnhandledMessage(new Error("mystery"))).toBe("Đã xảy ra lỗi. Thử lại sau.");
  });
});
