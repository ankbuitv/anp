# Kiến trúc ANP

```
                    ANP
                     │
        ┌────────────┼────────────┐
        │            │            │
       WEB        DESKTOP       MOBILE
        │            │            │
        └────────────┼────────────┘
                     │
                  REST API
                  /api/v1/
                     │
             Cloudflare Workers
                     │
          ┌──────────┴──────────┐
          │                     │
       Cloudflare D1       Cloudflare Workers KV
       Metadata            Original / thumb / preview
```

## Nguyên tắc

- API độc lập frontend. Web, Desktop, Mobile dùng chung `/api/v1`.
- D1 chỉ chứa metadata. Không lưu binary.
- Namespace KV không được client truy cập trực tiếp; mọi request đi qua Worker.
- Original giữ nguyên (EXIF không bị strip).
- Thumbnail / preview do client tạo, Worker lưu value riêng.
- Upload lớn: chia part 8 MB trong KV, hỗ trợ pause / resume / retry.
- Session: cookie HttpOnly + `Authorization: Bearer` cho Desktop/Mobile.

## Monorepo

| Path | Vai trò |
| --- | --- |
| `apps/web` | SPA React + Vite |
| `worker` | Hono trên Cloudflare Workers |
| `packages/api-types` | Type dùng chung client |
| `packages/shared` | MIME, format, moments, ZIP safety |
| `packages/validation` | Zod schema dùng cả 2 phía |
| `migrations` | D1 SQL |

## Upload và layout KV

```
Browser  →  POST /uploads (auth + checksum + EXIF)
         ←  uploadId + chunkSize  |  duplicate media
Browser  →  PUT  /uploads/:id/parts/:n   (8 MB)
         →  POST /uploads/:id/complete
         →  PUT  /uploads/:id/thumb
Worker   →  KV parts + manifest
         →  D1 media + version + audit
```

Storage key logic giữ dạng `u/{userId}/o/{mediaId}/{original,thumb,preview}.*`. File nhỏ nằm trong một KV value. File lớn có manifest tại storage key và các value part dưới prefix `__anp/parts/`; client không nhìn thấy layout nội bộ này.

## Media serving

`GET /api/v1/media/:id/{thumb,preview,file}` kiểm tra session hoặc share token rồi stream từ Workers KV. Với file chia part, Worker chỉ đọc các part giao với HTTP `Range`, phù hợp phát video và tải tiếp.

Workers KV có tính nhất quán eventual và quota theo gói. Đây là đánh đổi của phương án không dùng R2; xem `docs/cloudflare.md`.

## Private Vault

PIN 6 số hash PBKDF2. Cookie `anp_vault` ngắn hạn. Media `is_private=1` bị loại khỏi thư viện / share thường.

## Khoảnh khắc & kỷ niệm

Không AI. Gom ảnh theo khoảng thời gian 6 giờ và khoảng cách GPS 10 km. On this day: cùng ngày-tháng các năm trước.
