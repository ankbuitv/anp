# Cloudflare

## Dịch vụ

| Binding | Loại | Tên |
| --- | --- | --- |
| `DB` | D1 | `anp` |
| `BUCKET` | R2 | `anp-media` |
| `ASSETS` | Worker assets | `apps/web/dist` |

R2 **không public**. Mọi đọc đi qua Worker.

## Tạo tài nguyên

```bash
npx wrangler login
npx wrangler d1 create anp
npx wrangler r2 bucket create anp-media
```

Cập nhật `database_id` trong `wrangler.toml`.

```bash
npx wrangler d1 migrations apply anp --remote
npx wrangler secret put R2_ACCOUNT_ID      # tuỳ chọn, presign
npx wrangler secret put R2_ACCESS_KEY_ID   # tuỳ chọn
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

## Domain

Production: `https://p.ankb.qzz.io`

Gắn custom domain cho Worker trên dashboard (Workers → anp → Custom Domains) hoặc route zone.

API: `https://p.ankb.qzz.io/api/v1/`

## CORS R2

Không cần CORS bucket vì upload Phase 1 đi qua Worker (cùng origin).
