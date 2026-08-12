import { newId } from "./crypto";

export async function notify(
  db: D1Database,
  userId: string,
  type: string,
  title: string,
  body?: string,
  data?: Record<string, unknown>,
) {
  try {
    await db
      .prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, data_json, read_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .bind(newId(), userId, type, title, body ?? null, data ? JSON.stringify(data) : null, Date.now())
      .run();
  } catch (e) {
    console.warn("notify failed", e);
  }
}
