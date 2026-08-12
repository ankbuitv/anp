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
       Cloudflare D1         Cloudflare R2
       Metadata              Original / thumb / preview
```

## Nguyên tắc

- API độc lập frontend. Web, Desktop, Mobile dùng chung `/api/v1`.
- D1 chỉ chứa metadata. Không lưu binary.
- R2 private. Client không đọc bucket công khai.
- Original giữ nguyên (EXIF không bị strip).
- Thumbnail / preview do client tạo, Worker lưu object riêng.
- Upload lớn: multipart qua R2 binding, chunk 8 MB, pause / resume / retry.
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

## Upload

```
Browser  →  POST /uploads (auth + checksum + EXIF)
         ←  uploadId + chunkSize  |  duplicate media
Browser  →  PUT  /uploads/:id/parts/:n   (8 MB)
         →  POST /uploads/:id/complete
         →  PUT  /uploads/:id/thumb
Worker   →  R2 complete multipart
         →  D1 media + version + audit
```

Nếu có `R2_ACCESS_KEY_ID` có thể bổ sung presigned PUT sau này. Phase 1 không bắt buộc — binding đủ để chạy local và production.

## Media serving

`GET /api/v1/media/:id/{thumb,preview,file}` kiểm tra session hoặc share token, stream từ R2, hỗ trợ `Range` cho video.

## Private Vault

PIN 6 số hash PBKDF2. Cookie `anp_vault` ngắn hạn. Media `is_private=1` bị loại khỏi thư viện / share thường.

## Khoảnh khắc & kỷ niệm

Không AI. Gom ảnh theo khoảng thời gian 6 giờ và khoảng cách GPS 10 km. On this day: cùng ngày-tháng các năm trước.
