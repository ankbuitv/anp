# Triển khai

```
GitHub → GitHub Actions → Cloudflare Workers → p.ankb.qzz.io
                                      ├─ D1 metadata
                                      └─ Backblaze B2 media
```

## Local

```bash
npm install
npm run db:migrate:local
npm run dev
```

- Web: Vite `:5173` (proxy `/api` → Worker)
- API: Wrangler `:8787` (D1 + Workers KV fallback local)

Workflows mẫu nằm ở `docs/github-workflows/` (token Arena không có quyền ghi `.github/workflows`). Sau khi merge, copy vào `.github/workflows/`:

```bash
mkdir -p .github/workflows
cp docs/github-workflows/*.yml .github/workflows/
```

## Production

GitHub secrets:

- `CLOUDFLARE_API_TOKEN` (Workers, D1 và Workers KV edit)
- `CLOUDFLARE_ACCOUNT_ID`

Worker secrets (lưu bằng `npx wrangler secret put`, không ghi vào GitHub/repo):

- `B2_KEY_ID` — ID của Application Key con giới hạn bucket `anp-media`
- `B2_APP_KEY` — secret của key con

Không dùng master application key Backblaze. Key con chỉ cần List/Read/Write/Delete trên bucket này.

Tài nguyên production trong `wrangler.toml`:

- D1: `f1ae2e6b-4450-47c5-953d-3a6fe5924442`
- B2: `anp-media` tại `s3.us-east-005.backblazeb2.com`
- Workers KV fallback/nguồn migrate: `6fe12765c4714494ae4a0827393a0c78`

## Rollout KV → B2

1. Chạy test/typecheck/build.
2. Deploy adapter mới khi Worker chưa có B2 secrets, nên API vẫn đọc KV.
3. Chạy `npm run migrate:kv-to-b2` bằng session token và B2 key con trong shell; chạy `--verify-only` sau đó.
4. Chỉ khi report không lỗi mới chạy:

   ```bash
   npx wrangler secret put B2_KEY_ID
   npx wrangler secret put B2_APP_KEY
   npx wrangler deploy
   ```

5. Smoke test upload mới, thumbnail, download và Range video. Giữ KV trong thời gian rollback; không xóa sớm.

D1 giữ nguyên. Nếu chỉ deploy Worker mà quên D1 migration, API gọi `ensureSchema()` đầy đủ ở request đầu tiên. Health: `GET /api/v1/health` trả `db: "ok" | "error" | "missing"`.

## Kiểm tra

```bash
npm test
npm run typecheck
npm run build
curl -s https://p.ankb.qzz.io/api/v1/health
```

Chưa xác minh được production cho đến khi credentials, migration report, domain và smoke test thật đều sẵn sàng.
