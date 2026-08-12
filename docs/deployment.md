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
- API: Wrangler `:8787` (D1 + R2 local)

Workflows mẫu nằm ở `docs/github-workflows/` (token Arena không có quyền ghi `.github/workflows`).
Sau khi merge, copy vào `.github/workflows/`:

```bash
mkdir -p .github/workflows
cp docs/github-workflows/*.yml .github/workflows/
```

## Production

Secrets GitHub:

- `CLOUDFLARE_API_TOKEN` (Workers + D1 + R2 edit)
- `CLOUDFLARE_ACCOUNT_ID`

Nếu thiếu secret, workflow `deploy.yml` **không chạy**. Không giả lập deploy.

Trước lần đầu:

1. `wrangler d1 create anp` — dán `database_id` vào `wrangler.toml`
2. `wrangler r2 bucket create anp-media`
3. Gắn domain `p.ankb.qzz.io`
4. Push `main`

## Kiểm tra

```bash
curl -s https://p.ankb.qzz.io/api/v1/health
```

Chưa xác minh được production cho đến khi token + D1 id + domain thật có mặt.
