export const APP_NAME = "ANP";
export const API_PREFIX = "/api/v1";
export const MAX_FILES_PER_UPLOAD = 1000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
export const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB — dưới giới hạn body Worker
export const THUMB_MAX_EDGE = 360;
export const PREVIEW_MAX_EDGE = 1600;
export const SESSION_DAYS = 30;
export const EMAIL_VERIFY_HOURS = 24;
export const VAULT_SESSION_MINUTES = 30;
export const SHARE_TOKEN_BYTES = 18;
export const DROP_TTL_MINUTES = 30;
export const TRASH_RETENTION_DAYS = 30;
export const MAX_ZIP_ENTRIES = 5000;
export const MAX_ZIP_UNCOMPRESSED = 10 * 1024 * 1024 * 1024;
export const MAX_ZIP_RATIO = 100;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 10;

export const IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
  "image/bmp",
] as const;

export const VIDEO_MIMES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/x-msvideo",
  "video/x-matroska",
] as const;

export const IMAGE_EXTS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "heif",
  "avif",
  "tif",
  "tiff",
  "bmp",
] as const;

export const VIDEO_EXTS = ["mp4", "mov", "webm", "m4v", "avi", "mkv"] as const;

export const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
};

export type MediaType = "image" | "video";

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function mimeFromName(name: string, fallback = ""): string {
  return MIME_BY_EXT[extOf(name)] ?? fallback;
}

export function mediaTypeFromMime(mime: string): MediaType | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return null;
}

export function isAllowedMedia(mime: string, filename: string): boolean {
  const ext = extOf(filename);
  const byExt = (IMAGE_EXTS as readonly string[]).includes(ext) || (VIDEO_EXTS as readonly string[]).includes(ext);
  const byMime =
    (IMAGE_MIMES as readonly string[]).includes(mime) ||
    (VIDEO_MIMES as readonly string[]).includes(mime) ||
    mime.startsWith("image/") ||
    mime.startsWith("video/");
  return byExt && byMime;
}

export function objectKey(userId: string, mediaId: string, kind: "original" | "thumb" | "preview", ext: string): string {
  const safe = (ext || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  return `u/${userId}/o/${mediaId}/${kind}.${safe}`;
}

export function exportKey(userId: string, jobId: string): string {
  return `u/${userId}/exports/${jobId}.zip`;
}

export function dropKey(sessionId: string, fileId: string, ext: string): string {
  const safe = (ext || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  return `drop/${sessionId}/${fileId}.${safe}`;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  if (i === 0) return `${Math.round(v)} B`;
  return `${v.toFixed(1).replace(".", ",")} ${units[i]}`;
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)} giây`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m} phút ${s} giây`;
  const h = Math.floor(m / 60);
  return `${h} giờ ${m % 60} phút`;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = deg2rad(bLat - aLat);
  const dLng = deg2rad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(aLat)) * Math.cos(deg2rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

export type MomentSeed = {
  id: string;
  takenAt: number | null;
  uploadedAt: number;
  lat: number | null;
  lng: number | null;
  locationName: string | null;
};

export type MomentGroup = {
  mediaIds: string[];
  startAt: number;
  endAt: number;
  lat: number | null;
  lng: number | null;
  locationName: string | null;
};

const MOMENT_GAP_MS = 6 * 60 * 60 * 1000;
const MOMENT_KM = 10;

export function groupMoments(items: MomentSeed[]): MomentGroup[] {
  const sorted = [...items].sort((a, b) => timeOf(a) - timeOf(b));
  const groups: MomentGroup[] = [];
  let cur: MomentGroup | null = null;

  for (const it of sorted) {
    const t = timeOf(it);
    if (!cur) {
      cur = seedGroup(it, t);
      continue;
    }
    const closeInTime = t - cur.endAt <= MOMENT_GAP_MS;
    const closeInSpace = spatiallyClose(cur, it);
    if (closeInTime && closeInSpace) {
      cur.mediaIds.push(it.id);
      cur.endAt = t;
      if (cur.lat == null && it.lat != null && it.lng != null) {
        cur.lat = it.lat;
        cur.lng = it.lng;
      }
      if (!cur.locationName && it.locationName) cur.locationName = it.locationName;
    } else {
      groups.push(cur);
      cur = seedGroup(it, t);
    }
  }
  if (cur) groups.push(cur);
  return groups.filter((g) => g.mediaIds.length >= 2);
}

function timeOf(it: MomentSeed): number {
  return it.takenAt ?? it.uploadedAt;
}

function seedGroup(it: MomentSeed, t: number): MomentGroup {
  return {
    mediaIds: [it.id],
    startAt: t,
    endAt: t,
    lat: it.lat,
    lng: it.lng,
    locationName: it.locationName,
  };
}

function spatiallyClose(g: MomentGroup, it: MomentSeed): boolean {
  if (g.lat == null || g.lng == null || it.lat == null || it.lng == null) return true;
  return haversineKm(g.lat, g.lng, it.lat, it.lng) <= MOMENT_KM;
}

export function defaultMomentName(g: MomentGroup, locale = "vi-VN"): string {
  const start = new Date(g.startAt);
  const end = new Date(g.endAt);
  const d1 = start.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const d2 = end.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const range = d1 === d2 ? d1 : `${d1} – ${d2}`;
  if (g.locationName) return `${g.locationName} · ${range}`;
  return `Khoảnh khắc ${range}`;
}

export function safeZipEntryName(name: string): string | null {
  const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.endsWith("/")) return null;
  if (normalized.includes("..")) return null;
  if (/^[a-zA-Z]:/.test(normalized)) return null;
  return normalized;
}

export function isZipBomb(opts: {
  entries: number;
  compressed: number;
  uncompressed: number;
}): { ok: true } | { ok: false; reason: string } {
  if (opts.entries > MAX_ZIP_ENTRIES) return { ok: false, reason: "ZIP có quá nhiều file." };
  if (opts.uncompressed > MAX_ZIP_UNCOMPRESSED) return { ok: false, reason: "ZIP vượt giới hạn dung lượng giải nén." };
  if (opts.compressed > 0 && opts.uncompressed / opts.compressed > MAX_ZIP_RATIO) {
    return { ok: false, reason: "Tỷ lệ nén bất thường (nghi ngờ ZIP bomb)." };
  }
  return { ok: true };
}

export const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function formatShareCode(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

export function parseShareCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export const NAV = {
  main: [
    { to: "/", id: "home", label: "Trang chủ" },
    { to: "/library", id: "library", label: "Thư viện" },
    { to: "/videos", id: "videos", label: "Video" },
    { to: "/calendar", id: "calendar", label: "Lịch" },
    { to: "/map", id: "map", label: "Bản đồ" },
    { to: "/memories", id: "memories", label: "Kỷ niệm" },
  ],
  content: [
    { to: "/albums", id: "albums", label: "Album" },
    { to: "/favorites", id: "favorites", label: "Yêu thích" },
    { to: "/recent", id: "recent", label: "Ảnh mới" },
  ],
  private: [
    { to: "/private", id: "private", label: "Private Vault" },
    { to: "/shares", id: "shares", label: "Chia sẻ" },
  ],
  devices: [
    { to: "/drop", id: "drop", label: "ANP Drop" },
    { to: "/backup", id: "backup", label: "Sao lưu" },
  ],
  manage: [
    { to: "/cleanup", id: "cleanup", label: "Dọn dẹp" },
    { to: "/storage", id: "storage", label: "Dung lượng" },
    { to: "/trash", id: "trash", label: "Thùng rác" },
  ],
  system: [
    { to: "/notifications", id: "notifications", label: "Thông báo" },
    { to: "/activity", id: "activity", label: "Nhật ký" },
    { to: "/settings", id: "settings", label: "Cài đặt" },
  ],
} as const;

export const KEYBOARD_SHORTCUTS = [
  { keys: "←", action: "Ảnh trước" },
  { keys: "→", action: "Ảnh sau" },
  { keys: "Esc", action: "Đóng" },
  { keys: "I", action: "Thông tin" },
  { keys: "F", action: "Toàn màn hình" },
  { keys: "Space", action: "Phát / Tạm dừng" },
  { keys: "D", action: "Tải xuống" },
  { keys: "S", action: "Chia sẻ" },
  { keys: "Delete", action: "Xóa (thùng rác)" },
  { keys: "Ctrl + A", action: "Chọn tất cả (trang hiện tại)" },
  { keys: "Ctrl + Click", action: "Thêm / bỏ chọn" },
  { keys: "Shift + Click", action: "Chọn dải" },
] as const;
