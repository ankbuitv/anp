# ANP

Hệ thống lưu trữ, quản lý, sao lưu và chia sẻ **ảnh / video cá nhân**.

- Giao diện: **Tiếng Việt**
- Production: **https://p.ankb.qzz.io**
- Phase hiện tại: **1 — Web + REST API**
- Không AI. Không lưu media trong GitHub. Media nằm trong Workers KV và chỉ đọc qua Worker.

```
Web / Desktop / Mobile  →  /api/v1  →  Cloudflare Worker
                                      ├─ D1          metadata
                                      └─ Workers KV  original + thumb + preview
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

Mở Vite, đăng ký tài khoản, kéo thả ảnh. D1 và Workers KV được Wrangler giả lập trong `.wrangler/`, không commit.

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Việc cần để lên production

1. Tài khoản Cloudflare + API token có quyền Workers / D1 / Workers KV
2. D1 `f1ae2e6b-4450-47c5-953d-3a6fe5924442`
3. Workers KV `6fe12765c4714494ae4a0827393a0c78`
4. Custom domain `p.ankb.qzz.io` trỏ Worker
5. Secret gửi email xác minh: `MAIL_FROM` và `BREVO_API_KEY` (hoặc `RESEND_API_KEY`, hoặc `MAILGUN_API_KEY` + `MAILGUN_DOMAIN`)
6. GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

Storage dùng Workers KV thay R2, vì vậy không cần tạo R2 bucket, S3 credentials hay thẻ thanh toán R2. Xem quota và lưu ý eventual consistency tại [docs/cloudflare.md](docs/cloudflare.md).

Không có các credential trên thì **không tuyên bố đã deploy**.

## Cấu trúc

```
anp/
├── apps/web/              SPA React
├── packages/
│   ├── api-types/         Type dùng lại Desktop/Mobile
│   ├── shared/
│   └── validation/
├── worker/                Hono + D1 + Workers KV
├── migrations/
├── tests/
└── docs/
```

Tài liệu: [docs/architecture.md](docs/architecture.md) · [docs/api.md](docs/api.md) · [docs/database.md](docs/database.md) · [docs/cloudflare.md](docs/cloudflare.md) · [docs/deployment.md](docs/deployment.md) · [docs/security.md](docs/security.md) · [docs/desktop-roadmap.md](docs/desktop-roadmap.md) · [docs/mobile-roadmap.md](docs/mobile-roadmap.md)

## Phase 1 — Web đã có

Đăng ký / đăng nhập / phiên · upload resume 1.000 file · gallery cursor · viewer 2 panel · EXIF/GPS · album kéo-thả · lịch · bản đồ · kỷ niệm / khoảnh khắc · yêu thích · thùng rác · trùng checksum · dọn dẹp · dung lượng · Private Vault + PIN · share + QR + analytics · nhập ZIP an toàn · xuất album · thông báo · nhật ký · thiết bị · ANP Drop foundation · backup foundation · dark/light · phím tắt · API chung cho Phase 2/3.

## Giấy phép

MIT © 2026 ankb
