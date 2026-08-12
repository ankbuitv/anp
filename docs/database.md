# Database (Cloudflare D1)

Binary **không** lưu trong D1.

## Bảng

- `users` — hash + salt PBKDF2-SHA256 (100k), vault PIN hash
- `sessions` — `token_hash` SHA-256, hết hạn 30 ngày
- `vault_sessions` — PIN session 30 phút
- `devices` — web / desktop / ios / android
- `user_settings`
- `media` — metadata, EXIF, GPS, checksum, R2 keys, favorite, private, deleted_at
- `media_versions` — lịch sử metadata / object
- `albums`, `album_items`
- `shares`, `share_items` — token ngẫu nhiên, code `XXXX-XXXX`
- `upload_sessions` — multipart id, parts JSON
- `backup_sessions`, `backup_items`
- `drop_sessions`, `drop_files`
- `notifications`
- `audit_logs`
- `moments`
- `jobs`
- `login_attempts`

## Index

`user_id`, `created_at` / `taken_at` / `uploaded_at`, `media_type`, `checksum`, `deleted_at`, `album_id` (qua album_items), `device_id`.

Xem `migrations/0001_init.sql`.
