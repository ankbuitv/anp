export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string } };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
  total?: number;
};

export type UserPublic = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  hasVaultPin: boolean;
  createdAt: number;
};

export type SessionInfo = {
  id: string;
  deviceId: string | null;
  userAgent: string | null;
  createdAt: number;
  lastActiveAt: number;
  current: boolean;
};

export type Device = {
  id: string;
  name: string;
  type: "web" | "desktop" | "ios" | "android";
  platform: string | null;
  lastActiveAt: number;
  createdAt: number;
};

export type ExifInfo = {
  cameraMake: string | null;
  cameraModel: string | null;
  lens: string | null;
  iso: number | null;
  aperture: string | null;
  shutterSpeed: string | null;
  focalLength: string | null;
  orientation: number | null;
  lat: number | null;
  lng: number | null;
  locationName: string | null;
  takenAt: number | null;
  photographer: string | null;
};

export type Media = {
  id: string;
  filename: string;
  originalName: string;
  mime: string;
  mediaType: "image" | "video";
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  checksum: string;
  takenAt: number | null;
  uploadedAt: number;
  isFavorite: boolean;
  isPrivate: boolean;
  deletedAt: number | null;
  momentId: string | null;
  version: number;
  thumbUrl: string;
  previewUrl: string;
  fileUrl: string;
  albums: { id: string; name: string }[];
} & ExifInfo;

export type MediaVersion = {
  id: string;
  version: number;
  size: number | null;
  checksum: string | null;
  createdAt: number;
  current: boolean;
};

export type Album = {
  id: string;
  name: string;
  description: string | null;
  coverMediaId: string | null;
  coverUrl: string | null;
  isPrivate: boolean;
  mediaCount: number;
  createdAt: number;
  updatedAt: number;
};

export type Share = {
  id: string;
  code: string;
  token: string;
  url: string;
  type: "album" | "media" | "selection";
  albumId: string | null;
  title: string | null;
  permission: "view" | "download";
  hasAccessCode: boolean;
  expiresAt: number | null;
  revokedAt: number | null;
  viewCount: number;
  downloadCount: number;
  lastAccessedAt: number | null;
  createdAt: number;
  itemCount: number;
};

export type PublicShare = {
  title: string;
  permission: "view" | "download";
  expiresAt: number | null;
  requiresCode: boolean;
  unlocked: boolean;
  photoCount: number;
  videoCount: number;
  items: Media[];
};

export type UploadInit = {
  uploadId: string;
  mediaId: string;
  strategy: "single" | "multipart";
  chunkSize: number;
  uploadedParts: number[];
  duplicate: false;
};

export type UploadDuplicate = {
  duplicate: true;
  media: Media;
};

export type UploadStatus = {
  uploadId: string;
  status: "pending" | "uploading" | "completed" | "failed" | "cancelled";
  uploadedParts: number[];
  uploadedBytes: number;
  size: number;
  mediaId: string | null;
};

export type Moment = {
  id: string;
  name: string;
  startAt: number | null;
  endAt: number | null;
  lat: number | null;
  lng: number | null;
  locationName: string | null;
  mediaCount: number;
  coverUrl: string | null;
};

export type MemoryDay = {
  year: number;
  yearsAgo: number;
  count: number;
  items: Media[];
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: number | null;
  createdAt: number;
};

export type AuditLog = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: number;
};

export type StorageBreakdown = {
  images: { count: number; bytes: number };
  videos: { count: number; bytes: number };
  thumbs: { count: number; bytes: number };
  other: { count: number; bytes: number };
  total: { count: number; bytes: number };
  largest: { id: string; filename: string; size: number; mediaType: string }[];
};

export type CleanupReport = {
  duplicates: { checksum: string; count: number; size: number; ids: string[] }[];
  largeVideos: Media[];
  largeFiles: Media[];
  unalbumed: { count: number };
  trash: { count: number; bytes: number };
  old: { count: number };
};

export type DropSession = {
  id: string;
  code: string;
  type: "send" | "receive";
  status: string;
  expiresAt: number;
  createdAt: number;
  files: {
    id: string;
    filename: string;
    size: number;
    mime: string | null;
    status: string;
  }[];
};

export type BackupSession = {
  id: string;
  deviceId: string | null;
  status: string;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  skippedFiles: number;
  bytesTotal: number;
  bytesDone: number;
  createdAt: number;
  updatedAt: number;
};

export type Job = {
  id: string;
  type: string;
  status: string;
  progress: number;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
};

export type HomeSummary = {
  photoCount: number;
  videoCount: number;
  bytes: number;
  albumCount: number;
  recent: Media[];
  latest: Media[];
  memories: MemoryDay[];
};

export type CalendarDay = {
  date: string;
  count: number;
  photoCount: number;
  videoCount: number;
  coverUrl: string | null;
};

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  mediaType: "image" | "video";
  takenAt: number | null;
  thumbUrl: string;
};

export type UserSettings = {
  theme: "dark" | "light" | "system";
  slideshowSeconds: number;
};
