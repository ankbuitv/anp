# ANP

Hệ thống lưu trữ, quản lý, sao lưu và chia sẻ **ảnh / video cá nhân**.

- Giao diện: **Tiếng Việt**
- Production: **https://p.ankb.qzz.io**
- Phase hiện tại: **1 — Web + REST API**
- Không AI. Không lưu media trong GitHub. Không public R2.

```
Web / Desktop / Mobile  →  /api/v1  →  Cloudflare Worker
                                      ├─ D1  metadata
                                      └─ R2  original + thumb + preview
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
| API (Wrangler, D1/R2 local) | http://localhost:8787 |

Mở Vite, đăng ký tài khoản, kéo thả ảnh. File nằm trong R2 giả lập của Wrangler (`.wrangler/`), không commit.

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Việc cần để lên production

Chưa deploy được nếu thiếu:

1. Tài khoản Cloudflare + quyền Workers / D1 / R2
2. `wrangler d1 create anp` → thay `database_id` trong `wrangler.toml`
3. `wrangler r2 bucket create anp-media`
4. Custom domain `p.ankb.qzz.io` trỏ Worker
5. GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

Tuỳ chọn (presigned S3, Turnstile): xem `.env.example`.

Không có các credential trên thì **không tuyên bố đã deploy**.

## Cấu trúc

```
anp/
├── apps/web/              SPA React
├── packages/
│   ├── api-types/         Type dùng lại Desktop/Mobile
│   ├── shared/
│   └── validation/
├── worker/                Hono + D1 + R2
├── migrations/
├── tests/
├── docs/
└── .github/workflows/
```

Tài liệu: [docs/architecture.md](docs/architecture.md) · [docs/api.md](docs/api.md) · [docs/database.md](docs/database.md) · [docs/cloudflare.md](docs/cloudflare.md) · [docs/deployment.md](docs/deployment.md) · [docs/security.md](docs/security.md) · [docs/desktop-roadmap.md](docs/desktop-roadmap.md) · [docs/mobile-roadmap.md](docs/mobile-roadmap.md)

## Phase 1 — Web đã có

Đăng ký / đăng nhập / phiên · upload resume 1.000 file · gallery cursor · viewer 2 panel · EXIF/GPS · album kéo-thả · lịch · bản đồ · kỷ niệm / khoảnh khắc · yêu thích · thùng rác · trùng checksum · dọn dẹp · dung lượng · Private Vault + PIN · share + QR + analytics · nhập ZIP an toàn · xuất album · thông báo · nhật ký · thiết bị · ANP Drop foundation · backup foundation · dark/light · phím tắt · API chung cho Phase 2/3.

## Giấy phép

MIT © 2026 ankb
