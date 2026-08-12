import { defaultMomentName, groupMoments, type MomentSeed } from "@anp/shared";
import { newId } from "./crypto";
import type { MediaRow } from "./media";

export async function rebuildMoments(db: D1Database, userId: string) {
  const rows = await db
    .prepare(
      `SELECT id, taken_at, uploaded_at, lat, lng, location_name
       FROM media WHERE user_id = ? AND deleted_at IS NULL AND is_private = 0`,
    )
    .bind(userId)
    .all<Pick<MediaRow, "id" | "taken_at" | "uploaded_at" | "lat" | "lng" | "location_name">>();

  const seeds: MomentSeed[] = (rows.results ?? []).map((r) => ({
    id: r.id,
    takenAt: r.taken_at,
    uploadedAt: r.uploaded_at,
    lat: r.lat,
    lng: r.lng,
    locationName: r.location_name,
  }));

  const groups = groupMoments(seeds);
  const now = Date.now();

  const existing = await db
    .prepare(`SELECT id, name FROM moments WHERE user_id = ?`)
    .bind(userId)
    .all<{ id: string; name: string }>();
  const renamed = new Map((existing.results ?? []).map((m) => [m.id, m.name]));

  await db.prepare(`UPDATE media SET moment_id = NULL WHERE user_id = ?`).bind(userId).run();
  await db.prepare(`DELETE FROM moments WHERE user_id = ?`).bind(userId).run();

  for (const g of groups) {
    const id = newId();
    const name = defaultMomentName(g);
    const cover = g.mediaIds[0] ?? null;
    await db
      .prepare(
        `INSERT INTO moments (id, user_id, name, start_at, end_at, lat, lng, location_name, media_count, cover_media_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, userId, name, g.startAt, g.endAt, g.lat, g.lng, g.locationName, g.mediaIds.length, cover, now, now)
      .run();

    const chunk = 40;
    for (let i = 0; i < g.mediaIds.length; i += chunk) {
      const ids = g.mediaIds.slice(i, i + chunk);
      const ph = ids.map(() => "?").join(",");
      await db
        .prepare(`UPDATE media SET moment_id = ? WHERE id IN (${ph})`)
        .bind(id, ...ids)
        .run();
    }
    void renamed;
  }
}
