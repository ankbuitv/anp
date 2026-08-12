import type { Media, ExifInfo } from "@anp/api-types";

export type MediaRow = {
  id: string;
  user_id: string;
  filename: string;
  original_name: string;
  mime: string;
  media_type: "image" | "video";
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  checksum: string;
  storage_key: string;
  thumb_key: string | null;
  preview_key: string | null;
  thumb_size: number | null;
  preview_size: number | null;
  taken_at: number | null;
  uploaded_at: number;
  camera_make: string | null;
  camera_model: string | null;
  lens: string | null;
  iso: number | null;
  aperture: string | null;
  shutter_speed: string | null;
  focal_length: string | null;
  orientation: number | null;
  lat: number | null;
  lng: number | null;
  location_name: string | null;
  photographer: string | null;
  is_favorite: number;
  is_private: number;
  deleted_at: number | null;
  moment_id: string | null;
  device_id: string | null;
  version: number;
  extras: string | null;
};

export function publicMedia(row: MediaRow, albums: { id: string; name: string }[] = [], prefix = "/api/v1"): Media {
  return {
    id: row.id,
    filename: row.filename,
    originalName: row.original_name,
    mime: row.mime,
    mediaType: row.media_type,
    size: row.size,
    width: row.width,
    height: row.height,
    duration: row.duration,
    checksum: row.checksum,
    uploadedAt: row.uploaded_at,
    isFavorite: !!row.is_favorite,
    isPrivate: !!row.is_private,
    deletedAt: row.deleted_at,
    momentId: row.moment_id,
    version: row.version,
    thumbUrl: `${prefix}/media/${row.id}/thumb`,
    previewUrl: `${prefix}/media/${row.id}/preview`,
    fileUrl: `${prefix}/media/${row.id}/file`,
    albums,
    ...exifFromRow(row),
  };
}

export function exifFromRow(row: MediaRow): ExifInfo {
  return {
    cameraMake: row.camera_make,
    cameraModel: row.camera_model,
    lens: row.lens,
    iso: row.iso,
    aperture: row.aperture,
    shutterSpeed: row.shutter_speed,
    focalLength: row.focal_length,
    orientation: row.orientation,
    lat: row.lat,
    lng: row.lng,
    locationName: row.location_name,
    takenAt: row.taken_at,
    photographer: row.photographer,
  };
}

export function visibilitySql(includePrivate: boolean, alias = "m"): string {
  if (includePrivate) return `${alias}.deleted_at IS NULL`;
  return `${alias}.deleted_at IS NULL AND ${alias}.is_private = 0`;
}

export async function albumsForMedia(db: D1Database, mediaIds: string[]): Promise<Map<string, { id: string; name: string }[]>> {
  const map = new Map<string, { id: string; name: string }[]>();
  if (!mediaIds.length) return map;
  const chunk = 80;
  for (let i = 0; i < mediaIds.length; i += chunk) {
    const ids = mediaIds.slice(i, i + chunk);
    const ph = ids.map(() => "?").join(",");
    const rows = await db
      .prepare(
        `SELECT ai.media_id as media_id, a.id as id, a.name as name
         FROM album_items ai JOIN albums a ON a.id = ai.album_id
         WHERE ai.media_id IN (${ph})`,
      )
      .bind(...ids)
      .all<{ media_id: string; id: string; name: string }>();
    for (const r of rows.results ?? []) {
      const list = map.get(r.media_id) ?? [];
      list.push({ id: r.id, name: r.name });
      map.set(r.media_id, list);
    }
  }
  return map;
}

export async function getMedia(db: D1Database, id: string, userId?: string): Promise<MediaRow | null> {
  const q = userId
    ? db.prepare(`SELECT * FROM media WHERE id = ? AND user_id = ?`).bind(id, userId)
    : db.prepare(`SELECT * FROM media WHERE id = ?`).bind(id);
  return (await q.first<MediaRow>()) ?? null;
}
