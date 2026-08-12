-- ANP Phase 1 schema
-- Metadata only. Binary media lives in R2, never in D1 / Git.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  avatar_key TEXT,
  vault_pin_hash TEXT,
  vault_pin_salt TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_users_email ON users(email);

CREATE TABLE sessions (
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
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE UNIQUE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  platform TEXT,
  last_active_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_devices_user ON devices(user_id);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY,
  theme TEXT NOT NULL DEFAULT 'dark',
  slideshow_seconds INTEGER NOT NULL DEFAULT 5,
  extras TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE media (
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
);
CREATE INDEX idx_media_user_taken ON media(user_id, taken_at);
CREATE INDEX idx_media_user_uploaded ON media(user_id, uploaded_at);
CREATE INDEX idx_media_user_type ON media(user_id, media_type);
CREATE INDEX idx_media_checksum ON media(user_id, checksum);
CREATE INDEX idx_media_deleted ON media(user_id, deleted_at);
CREATE INDEX idx_media_favorite ON media(user_id, is_favorite);
CREATE INDEX idx_media_private ON media(user_id, is_private);
CREATE INDEX idx_media_moment ON media(moment_id);
CREATE INDEX idx_media_gps ON media(user_id, lat, lng);

CREATE TABLE media_versions (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  r2_key TEXT,
  checksum TEXT,
  size INTEGER,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);
CREATE INDEX idx_versions_media ON media_versions(media_id);

CREATE TABLE albums (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cover_media_id TEXT,
  is_private INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_albums_user ON albums(user_id, created_at);

CREATE TABLE album_items (
  album_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (album_id, media_id),
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);
CREATE INDEX idx_album_items_media ON album_items(media_id);

CREATE TABLE shares (
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
);
CREATE UNIQUE INDEX idx_shares_code ON shares(code);
CREATE UNIQUE INDEX idx_shares_token ON shares(token);
CREATE INDEX idx_shares_user ON shares(user_id);

CREATE TABLE share_items (
  share_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  PRIMARY KEY (share_id, media_id),
  FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  checksum TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  multipart_upload_id TEXT,
  status TEXT NOT NULL,
  uploaded_parts TEXT,
  uploaded_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  metadata_json TEXT,
  media_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_uploads_user ON upload_sessions(user_id, created_at);
CREATE INDEX idx_uploads_checksum ON upload_sessions(user_id, checksum);

CREATE TABLE backup_sessions (
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
);
CREATE INDEX idx_backup_user ON backup_sessions(user_id, created_at);

CREATE TABLE backup_items (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  local_path TEXT,
  checksum TEXT,
  size INTEGER,
  status TEXT NOT NULL,
  media_id TEXT,
  error TEXT,
  FOREIGN KEY (session_id) REFERENCES backup_sessions(id) ON DELETE CASCADE
);
CREATE INDEX idx_backup_items_session ON backup_items(session_id);

CREATE TABLE drop_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  code TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  peer_device TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_drop_code ON drop_sessions(code);

CREATE TABLE drop_files (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT,
  r2_key TEXT,
  status TEXT NOT NULL,
  media_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES drop_sessions(id) ON DELETE CASCADE
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data_json TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_notif_user ON notifications(user_id, created_at);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  meta_json TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at);

CREATE TABLE moments (
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
);
CREATE INDEX idx_moments_user ON moments(user_id, start_at);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  result_json TEXT,
  error TEXT,
  r2_key TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_jobs_user ON jobs(user_id, created_at);

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT,
  success INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts ON login_attempts(email, created_at);

CREATE TABLE vault_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_vault_token ON vault_sessions(token_hash);
CREATE INDEX idx_vault_user ON vault_sessions(user_id);
