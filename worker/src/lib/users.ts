import { isMissingColumn, isMissingTable } from "./schema";

export async function markEmailVerified(db: D1Database, userId: string): Promise<void> {
  try {
    await db.prepare(`UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?`).bind(Date.now(), userId).run();
  } catch (err) {
    if (!isMissingColumn(err, "email_verified")) throw err;
  }
}

export async function insertUser(
  db: D1Database,
  row: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    passwordSalt: string;
    emailVerified: boolean;
    now: number;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO users (id, name, email, password_hash, password_salt, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(row.id, row.name, row.email, row.passwordHash, row.passwordSalt, row.emailVerified ? 1 : 0, row.now, row.now)
      .run();
  } catch (err) {
    if (!isMissingColumn(err, "email_verified")) throw err;
    await db
      .prepare(
        `INSERT INTO users (id, name, email, password_hash, password_salt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(row.id, row.name, row.email, row.passwordHash, row.passwordSalt, row.now, row.now)
      .run();
  }
}

export async function pendingVerificationId(db: D1Database, userId: string): Promise<string | null> {
  try {
    const row = await db
      .prepare(
        `SELECT id FROM email_verifications WHERE user_id = ? AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(userId, Date.now())
      .first<{ id: string }>();
    return row?.id ?? null;
  } catch (err) {
    if (isMissingTable(err, "email_verifications")) return null;
    throw err;
  }
}
