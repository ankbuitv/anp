/** Idempotent D1 schema repair. Cloudflare Git deploy does not apply wrangler migrations. */

const STORAGE_TABLES = ["media", "media_versions", "upload_sessions", "jobs", "drop_files"] as const;

let schemaPromise: Promise<void> | null = null;

export function resetSchemaCache() {
  schemaPromise = null;
}

export function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err ?? "");
}

export function isMissingColumn(err: unknown, column?: string): boolean {
  const msg = errorText(err);
  if (!/no such column/i.test(msg)) return false;
  return column ? msg.includes(column) : true;
}

export function isMissingTable(err: unknown, table?: string): boolean {
  const msg = errorText(err);
  if (!/no such table/i.test(msg)) return false;
  return table ? msg.includes(table) : true;
}

export function isDuplicateColumn(err: unknown): boolean {
  return /duplicate column/i.test(errorText(err));
}

export function isSchemaError(err: unknown): boolean {
  const msg = errorText(err);
  return /no such (column|table)|duplicate column|D1_ERROR|SQLITE_/i.test(msg);
}

export async function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = applyPendingMigrations(db).catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  await schemaPromise;
}

async function columnNames(db: D1Database, table: string): Promise<string[] | null> {
  try {
    const rows = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    return (rows.results ?? []).map((row) => row.name);
  } catch {
    return null;
  }
}

async function addColumn(db: D1Database, table: string, name: string, ddl: string): Promise<boolean> {
  const cols = await columnNames(db, table);
  if (cols?.includes(name)) return false;
  try {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
    return true;
  } catch (err) {
    if (isDuplicateColumn(err)) return false;
    if (isMissingTable(err, table)) return false;
    throw err;
  }
}

async function applyPendingMigrations(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    avatar_key TEXT,
    vault_pin_hash TEXT,
    vault_pin_salt TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`).run();

  const addedEmail = await addColumn(db, "users", "email_verified", "email_verified INTEGER NOT NULL DEFAULT 0");
  if (addedEmail) {
    await db.prepare(`UPDATE users SET email_verified = 1 WHERE email_verified = 0`).run();
  }

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS email_verifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
    )
    .run();
  await db
    .prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token_hash)`)
    .run();
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id, created_at)`)
    .run();

  for (const table of STORAGE_TABLES) {
    const added = await addColumn(db, table, "storage_key", "storage_key TEXT");
    if (added) {
      try {
        await db.prepare(`UPDATE ${table} SET storage_key = r2_key WHERE storage_key IS NULL`).run();
      } catch (err) {
        if (!isMissingColumn(err, "r2_key")) throw err;
      }
    }
  }
}
