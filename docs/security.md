# Bảo mật

- HTTPS (production) + HSTS
- Cookie session HttpOnly, Secure (HTTPS), SameSite=Lax
- Mật khẩu / PIN: PBKDF2-SHA256, 100k, salt ngẫu nhiên. Không plaintext.
- Bearer token cho Desktop/Mobile; chỉ lưu SHA-256 trên D1
- Email xác minh: token ngẫu nhiên, chỉ lưu SHA-256, hết hạn 24 giờ, dùng một lần
- Origin check cho mutation
- Rate limit theo IP (isolate memory) cho login / share / drop / upload
- Login lockout 10 lần / 15 phút (D1)
- MIME + extension allow-list
- Giới hạn 5 GB / file, 1000 file / lượt, chunk 8 MB
- Object key: `u/{userId}/o/{mediaId}/…` — không dùng tên file người dùng
- Bucket B2 là private; download luôn qua Worker sau auth/share check và hỗ trợ Range
- B2 dùng Application Key con giới hạn bucket với List/Read/Write/Delete và `listAllBucketNames`; không dùng master key
- `B2_KEY_ID`, `B2_APP_KEY`, session token và vault token không commit/không gửi qua chat
- Workers KV fallback chỉ truy cập qua binding
- Share token ngẫu nhiên, thu hồi, hết hạn, quyền view|download
- ZIP: chặn `..`, ổ đĩa, số entry, tỷ lệ nén
- SQL bind parameters
- Không render stack trace
- Header: nosniff, SAMEORIGIN, Referrer-Policy, Permissions-Policy

## Chưa làm (ghi rõ)

- Turnstile (cần `TURNSTILE_SECRET`)
- Cloudflare WAF / Rate Limiting ruleset trên zone
- CSRF token riêng (SameSite + Origin đủ cho SPA same-site)
- Cảnh báo quota B2/KV và lifecycle tự động cho version cũ của bucket B2
