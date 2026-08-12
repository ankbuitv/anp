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
- Workers KV chỉ truy cập qua binding; download qua Worker / Range
- Share token ngẫu nhiên, thu hồi, hết hạn, quyền view|download
- ZIP: chặn `..`, ổ đĩa, số entry, tỷ lệ nén
- SQL bind parameters
- Không render stack trace
- Không commit `.dev.vars` / secrets
- Header: nosniff, SAMEORIGIN, Referrer-Policy, Permissions-Policy

## Chưa làm (ghi rõ)

- Turnstile (cần `TURNSTILE_SECRET`)
- Cloudflare WAF / Rate Limiting ruleset trên zone
- CSRF token riêng (SameSite + Origin đủ cho SPA same-site)
- Theo dõi quota và cảnh báo eventual consistency của Workers KV
