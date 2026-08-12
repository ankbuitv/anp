-- Email verification for self-service signups.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
-- Tài khoản đã tồn tại trước tính năng này được coi là đã xác minh.
UPDATE users SET email_verified = 1 WHERE email_verified = 0;

CREATE TABLE email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_email_verifications_token ON email_verifications(token_hash);
CREATE INDEX idx_email_verifications_user ON email_verifications(user_id, created_at);
