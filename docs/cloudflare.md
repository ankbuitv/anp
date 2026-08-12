# Cloudflare

## Dịch vụ

| Binding | Loại | Tên / ID |
| --- | --- | --- |
| `DB` | D1 | `anp` / `f1ae2e6b-4450-47c5-953d-3a6fe5924442` |
| `MEDIA` | Workers KV | `6fe12765c4714494ae4a0827393a0c78` |
| `ASSETS` | Worker assets | `apps/web/dist` |

Media không có URL công khai. Mọi đọc/ghi đi qua Worker sau khi kiểm tra session hoặc share token.

## Tạo tài nguyên mới (nếu cần)

Các ID production đã có trong `wrangler.toml`. Khi dựng một môi trường Cloudflare khác:

```bash
npx wrangler login
npx wrangler d1 create anp
npx wrangler kv namespace create MEDIA
```

Dán `database_id` và KV `id` được trả về vào `wrangler.toml`, rồi chạy:

```bash
npx wrangler d1 migrations apply anp --remote
```

Workers KV thay cho R2 nên không cần tạo bucket, API key S3 hay thẻ thanh toán cho R2. Cần lưu ý quota đọc/ghi và dung lượng của gói Workers KV đang dùng.

## Cách lưu media trong KV

Mỗi file được chia thành phần 8 MB, nhỏ hơn giới hạn một value của Workers KV. Worker lưu các part dưới prefix nội bộ và một manifest tại storage key chính. Cách này giữ được upload pause/resume và HTTP `Range` mà không công khai namespace.

Workers KV có tính nhất quán eventual. File mới có thể cần một khoảng ngắn để đọc được từ một location khác sau khi upload.

## Domain

Production: `https://p.ankb.qzz.io`

Gắn custom domain cho Worker trên dashboard (Workers → anp → Custom Domains) hoặc route zone.

API: `https://p.ankb.qzz.io/api/v1/`

Không cần cấu hình CORS riêng cho KV vì client chỉ gọi Worker cùng origin.
