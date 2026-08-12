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

async function exec(db: D1Database, sql: string) {
  await db.prepare(sql).run();
}

async function applyPendingMigrations(db: D1Database) {
  // ---- users ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    avatar_key TEXT,
    vault_pin_hash TEXT,
    vault_pin_salt TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  );
  await exec(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

  const addedEmail = await addColumn(db, "users", "email_verified", "email_verified INTEGER NOT NULL DEFAULT 0");
  if (addedEmail) {
    await exec(db, `UPDATE users SET email_verified = 1 WHERE email_verified = 0`);
  }

  // ---- email_verifications ----
  await exec(
    db,
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
  );
  await exec(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token_hash)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id, created_at)`);

  // ---- sessions ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT,
    token_hash TEXT NOT NULL,
    user_agent TEXT,
    ip TEXT,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
  await exec(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);

  // ---- devices ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    platform TEXT,
    last_active_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id)`);

  // ---- user_settings (đây là bảng bị thiếu gây lỗi đăng ký) ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    theme TEXT NOT NULL DEFAULT 'dark',
    slideshow_seconds INTEGER NOT NULL DEFAULT 5,
    extras TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  );

  // ---- media ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    media_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration REAL,
    checksum TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    storage_key TEXT,
    thumb_key TEXT,
    preview_key TEXT,
    thumb_size INTEGER,
    preview_size INTEGER,
    taken_at INTEGER,
    uploaded_at INTEGER NOT NULL,
    camera_make TEXT,
    camera_model TEXT,
    lens TEXT,
    iso INTEGER,
    aperture TEXT,
    shutter_speed TEXT,
    focal_length TEXT,
    orientation INTEGER,
    lat REAL,
    lng REAL,
    location_name TEXT,
    photographer TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_private INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    moment_id TEXT,
    device_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    extras TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_media_user_taken ON media(user_id, taken_at)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_media_user_uploaded ON media(user_id, uploaded_at)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_media_user_type ON media(user_id, media_type)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_media_checksum ON media(user_id, checksum)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_media_deleted ON media(user_id, deleted_at)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_media_favorite ON media(user_id, is_favorite)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_media_private ON media(user_id, is_private)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_media_moment ON media(moment_id)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_media_gps ON media(user_id, lat, lng)`);

  // ---- media_versions ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS media_versions (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    r2_key TEXT,
    storage_key TEXT,
    checksum TEXT,
    size INTEGER,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_versions_media ON media_versions(media_id)`);

  // ---- albums ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    cover_media_id TEXT,
    is_private INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_albums_user ON albums(user_id, created_at)`);

  // ---- album_items ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS album_items (
    album_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (album_id, media_id),
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_album_items_media ON album_items(media_id)`);

  // ---- shares ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code TEXT NOT NULL,
    token TEXT NOT NULL,
    type TEXT NOT NULL,
    album_id TEXT,
    title TEXT,
    permission TEXT NOT NULL DEFAULT 'view',
    access_code_hash TEXT,
    expires_at INTEGER,
    revoked_at INTEGER,
    view_count INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_code ON shares(code)`);
  await exec(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_token ON shares(token)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id)`);

  // ---- share_items ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS share_items (
    share_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    PRIMARY KEY (share_id, media_id),
    FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
  )`,
  );

  // ---- upload_sessions ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS upload_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT NOT NULL,
    checksum TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    storage_key TEXT,
    multipart_upload_id TEXT,
    status TEXT NOT NULL,
    uploaded_parts TEXT,
    uploaded_bytes INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    metadata_json TEXT,
    media_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_uploads_user ON upload_sessions(user_id, created_at)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_uploads_checksum ON upload_sessions(user_id, checksum)`);

  // ---- backup_sessions ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS backup_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT,
    status TEXT NOT NULL,
    total_files INTEGER NOT NULL DEFAULT 0,
    completed_files INTEGER NOT NULL DEFAULT 0,
    failed_files INTEGER NOT NULL DEFAULT 0,
    skipped_files INTEGER NOT NULL DEFAULT 0,
    bytes_total INTEGER NOT NULL DEFAULT 0,
    bytes_done INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    extras TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_backup_user ON backup_sessions(user_id, created_at)`);

  // ---- backup_items ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS backup_items (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    local_path TEXT,
    checksum TEXT,
    size INTEGER,
    status TEXT NOT NULL,
    media_id TEXT,
    error TEXT,
    FOREIGN KEY (session_id) REFERENCES backup_sessions(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_backup_items_session ON backup_items(session_id)`);

  // ---- drop_sessions ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS drop_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    code TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    peer_device TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  );
  await exec(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_drop_code ON drop_sessions(code)`);

  // ---- drop_files ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS drop_files (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT,
    r2_key TEXT,
    storage_key TEXT,
    status TEXT NOT NULL,
    media_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES drop_sessions(id) ON DELETE CASCADE
  )`,
  );

  // ---- notifications ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data_json TEXT,
    read_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at)`);

  // ---- audit_logs ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    meta_json TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at)`);

  // ---- moments ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS moments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_at INTEGER,
    end_at INTEGER,
    lat REAL,
    lng REAL,
    location_name TEXT,
    media_count INTEGER NOT NULL DEFAULT 0,
    cover_media_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_moments_user ON moments(user_id, start_at)`);

  // ---- jobs ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT,
    result_json TEXT,
    error TEXT,
    r2_key TEXT,
    storage_key TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id, created_at)`);

  // ---- login_attempts ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    ip TEXT,
    success INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  );
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(email, created_at)`);

  // ---- vault_sessions ----
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS vault_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  );
  await exec(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_token ON vault_sessions(token_hash)`);
  await exec(db, `CREATE INDEX IF NOT EXISTS idx_vault_user ON vault_sessions(user_id)`);

  // ---- storage_key columns for legacy DBs (migration 0002) ----
  for (const table of STORAGE_TABLES) {
    const added = await addColumn(db, table, "storage_key", "storage_key TEXT");
    if (added) {
      try {
        await exec(db, `UPDATE ${table} SET storage_key = r2_key WHERE storage_key IS NULL`);
      } catch (err) {
        if (!isMissingColumn(err, "r2_key")) throw err;
      }
    }
  }
}
