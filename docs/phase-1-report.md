# Báo cáo Phase 1 — ANP Web + API

Ngày: 2026-08-12  
Nhánh: `arena/019ff37a-anp`

## 1. Architecture

SPA React (Vite) + REST `/api/v1` trên Cloudflare Workers. D1 metadata, Workers KV object (private qua binding). Upload multipart 8 MB qua KV, resume theo checksum. Session cookie HttpOnly + Bearer. Chi tiết: `docs/architecture.md`.

## 2. Files created

Monorepo mới: `apps/web`, `worker`, `packages/{api-types,shared,validation}`, `migrations/0001_init.sql`, `tests/*`, `docs/*`, `.github/workflows/{ci,deploy}.yml`, `wrangler.toml`.

## 3. Database schema

Xem `migrations/0001_init.sql` và `docs/database.md`. Đủ bảng Phase 1 + foundation backup/drop/jobs/versions.

## 4. API

`/api/v1/auth|media|uploads|albums|shares|favorites|trash|storage|devices|backup|drop|notifications|activity|moments|home|jobs`. Tài liệu: `docs/api.md`.

## 5. Cloudflare configuration

`wrangler.toml`: D1 `anp`, Workers KV binding `MEDIA`, assets `apps/web/dist`, `run_worker_first = ["/api/*"]`.
`database_id` và KV namespace `id` production đã được cấu hình.

## 6. Workers KV

Binding `MEDIA`. Key `u/{userId}/o/{mediaId}/{original,thumb,preview}.*`. Không public. File lớn chia part 8 MB; serve qua Worker + Range.

## 7. D1

Migrations trong `migrations/`. Local: `npm run db:migrate:local`. Remote: workflow deploy khi có secret.

## 8. GitHub Actions

- `ci.yml`: install, lint, typecheck, test, build
- `deploy.yml`: chỉ chạy khi có `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`

## 9. Tests

18 unit tests: SHA-256, PBKDF2, ZIP store, zip-bomb, moments, validation, API contract.

## 10. Build result

`npm run lint` ✓ · `npm run typecheck` ✓ · `npm test` 18/18 ✓ · `npm run build` (Vite) ✓

## 11. Deployment status

**Chưa deploy production.** Thiếu:

- Cloudflare account / API token
- Custom domain `p.ankb.qzz.io` gắn Worker

Không giả lập deployment.

## 12. Known limitations

- Thumbnail/preview tạo ở client (HEIC có thể không decode trên mọi trình duyệt)
- Export ZIP lớn: client-side (album) + job metadata (toàn bộ). Worker không zip hàng GB original trong một request
- ANP Drop web: file ≤ 90 MB / file; LAN/Bluetooth là Phase 2/3
- Auto backup camera: foundation API only
- Version history: lưu metadata/object version, chưa UI khôi phục file cũ đầy đủ
- Rate limit in-memory theo isolate (bổ sung WAF khi có zone)
- Turnstile: cần secret, chưa bật; Workers KV có quota và eventual consistency
- Bản đồ: OSM/Carto, cluster đơn giản

## 13. Next phase

Desktop Windows: Auto Backup, Folder Sync, ANP Drive, LAN, Drop, right-click, tray — dùng API hiện có. Xem `docs/desktop-roadmap.md`.
