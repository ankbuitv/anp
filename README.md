# ANP

Hệ thống lưu trữ, quản lý, sao lưu và chia sẻ **ảnh / video cá nhân**.

- Giao diện: **Tiếng Việt**
- Production: **https://p.ankb.qzz.io**
- Phase hiện tại: **1 — Web + REST API**
- Không AI. Không lưu media trong GitHub. Media production nằm trong bucket Backblaze B2 private và chỉ đọc qua Worker.

```
Web / Desktop / Mobile  →  /api/v1  →  Cloudflare Worker
                                      ├─ D1              metadata (giữ nguyên)
                                      └─ Backblaze B2    original + thumb + preview
                                          └─ Workers KV  fallback/local trong giai đoạn chuyển đổi
```

## Chạy local

Yêu cầu: Node 20+.

```bash
git clone <repo>
cd anp
npm install
npm run db:migrate:local
npm run dev
```

| Tiến trình | Địa chỉ |
| --- | --- |
| Web (Vite) | http://localhost:5173 |
| API (Wrangler, D1/KV local) | http://localhost:8787 |

Mở Vite, đăng ký tài khoản, kéo thả ảnh. D1 và Workers KV fallback được Wrangler giả lập trong `.wrangler/`, không commit. Muốn test B2 thật, sao chép `.dev.vars.example` thành `.dev.vars` và điền **Application Key con** giới hạn bucket; không dùng master key.

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Việc cần để lên production

1. Tài khoản Cloudflare + API token có quyền Workers / D1 / Workers KV
2. D1 `f1ae2e6b-4450-47c5-953d-3a6fe5924442` (metadata vẫn ở D1, không migrate)
3. Backblaze B2 bucket private `anp-media`, endpoint `https://s3.us-east-005.backblazeb2.com`
4. Workers KV `6fe12765c4714494ae4a0827393a0c78` được giữ tạm làm nguồn/fallback khi chuyển đổi
5. Custom domain `p.ankb.qzz.io` trỏ Worker
6. Secret gửi email xác minh: `MAIL_FROM` và `BREVO_API_KEY` (hoặc `RESEND_API_KEY`, hoặc `MAILGUN_API_KEY` + `MAILGUN_DOMAIN`)
7. GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

### Cấu hình B2 an toàn

Trong Backblaze **App Keys → Add a New Application Key**, tạo key con chỉ cho bucket `anp-media`, với quyền **List/Read/Write/Delete**. Không dùng, không gửi qua chat, và không ghi master application key vào repo. Secret chỉ hiện một lần; lưu bằng secret manager rồi cấu hình Worker:

```bash
npx wrangler secret put B2_KEY_ID
npx wrangler secret put B2_APP_KEY
```

Worker chỉ dùng B2 khi có đủ `B2_BUCKET`, `B2_ENDPOINT`, `B2_KEY_ID` và `B2_APP_KEY`; nếu thiếu sẽ dùng binding `MEDIA` KV. Bucket là private, mọi file vẫn đi qua kiểm tra quyền của API.

### Chuyển dữ liệu KV cũ

Thực hiện theo thứ tự để tránh Worker đọc bucket trống:

1. Deploy phiên bản adapter mới **trước khi** kích hoạt hai B2 secrets; lúc này API vẫn đọc KV.
2. Lấy giá trị cookie `anp_session` của chính tài khoản từ DevTools và đặt vào `ANP_TOKEN` trong shell tạm. Đây là secret phiên đăng nhập, không commit/không gửi qua chat.
3. Chạy thử vài media, rồi chạy toàn bộ. Script duyệt mọi cursor, retry, ráp file KV chunk qua API, giữ nguyên key và tự bỏ qua object đã có để resume:

Nạp secrets vào environment bằng secret manager hoặc prompt ẩn (không gõ giá trị trực tiếp vào command history), rồi chạy:

```bash
read -rsp "ANP session: " ANP_TOKEN; export ANP_TOKEN; echo
read -rsp "B2 key ID: " B2_KEY_ID; export B2_KEY_ID; echo
read -rsp "B2 app key: " B2_APP_KEY; export B2_APP_KEY; echo

npm run migrate:kv-to-b2 -- --max-items=3
npm run migrate:kv-to-b2
npm run migrate:kv-to-b2 -- --verify-only

unset ANP_TOKEN B2_KEY_ID B2_APP_KEY ANP_VAULT_TOKEN
```

Dùng `--include-private` cùng `ANP_VAULT_TOKEN` nếu có Private Vault đang mở, và `--include-trash` nếu cần giữ cả thùng rác. Xem `npm run migrate:kv-to-b2 -- --help` để biết mọi tùy chọn.

4. Khi report không còn lỗi và B2 đã đủ object, mới lưu `B2_KEY_ID`/`B2_APP_KEY` bằng `wrangler secret put` rồi deploy. Upload mới từ thời điểm đó dùng S3 multipart thật trên B2.
5. Test upload, xem ảnh/video và Range request. Chỉ dọn KV sau khi đã xác minh và có phương án rollback.

Không có các credential trên thì **không tuyên bố đã deploy hoặc migrate production**.

## Cấu trúc

```
anp/
├── apps/web/              SPA React
├── packages/
│   ├── api-types/         Type dùng lại Desktop/Mobile
│   ├── shared/
│   └── validation/
├── worker/                Hono + D1 + Backblaze B2 (KV fallback)
├── migrations/
├── tests/
└── docs/
```

Tài liệu: [docs/architecture.md](docs/architecture.md) · [docs/api.md](docs/api.md) · [docs/database.md](docs/database.md) · [docs/cloudflare.md](docs/cloudflare.md) · [docs/deployment.md](docs/deployment.md) · [docs/security.md](docs/security.md) · [docs/desktop-roadmap.md](docs/desktop-roadmap.md) · [docs/mobile-roadmap.md](docs/mobile-roadmap.md)

## Phase 1 — Web đã có

Đăng ký / đăng nhập / phiên · upload resume 1.000 file · gallery cursor · viewer 2 panel · EXIF/GPS · album kéo-thả · lịch · bản đồ · kỷ niệm / khoảnh khắc · yêu thích · thùng rác · trùng checksum · dọn dẹp · dung lượng · Private Vault + PIN · share + QR + analytics · nhập ZIP an toàn · xuất album · thông báo · nhật ký · thiết bị · ANP Drop foundation · backup foundation · dark/light · phím tắt · API chung cho Phase 2/3.

## Giấy phép

MIT © 2026 ankb
