# Triển khai

```
GitHub → GitHub Actions → Cloudflare Workers → p.ankb.qzz.io
```

## Local

```bash
npm install
npm run db:migrate:local
npm run dev
```

- Web: Vite `:5173` (proxy `/api` → Worker)
- API: Wrangler `:8787` (D1 + Workers KV local)

Workflows mẫu nằm ở `docs/github-workflows/` (token Arena không có quyền ghi `.github/workflows`).
Sau khi merge, copy vào `.github/workflows/`:

```bash
mkdir -p .github/workflows
cp docs/github-workflows/*.yml .github/workflows/
```

## Production

Secrets GitHub:

- `CLOUDFLARE_API_TOKEN` (Workers, D1 và Workers KV edit)
- `CLOUDFLARE_ACCOUNT_ID`

Nếu thiếu secret, workflow `deploy.yml` **không chạy**. Không giả lập deploy.

Tài nguyên production đã cấu hình trong `wrangler.toml`:

- D1: `f1ae2e6b-4450-47c5-953d-3a6fe5924442`
- Workers KV: `6fe12765c4714494ae4a0827393a0c78`

Trước lần đầu:

1. Kiểm tra token có quyền Workers Scripts, D1 và Workers KV.
2. Chạy `npx wrangler d1 migrations apply anp --remote`.
3. Gắn domain `p.ankb.qzz.io`.
4. Push `main` hoặc chạy workflow deploy.

Không cần R2 bucket, S3 credentials hay thẻ thanh toán R2.

## Kiểm tra

```bash
curl -s https://p.ankb.qzz.io/api/v1/health
```

Chưa xác minh được production cho đến khi token, migrations và domain thật sẵn sàng.
