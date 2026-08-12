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
       Cloudflare D1       Backblaze B2 private
       Metadata            Original / thumb / preview
                               │
                         Workers KV fallback
```

## Nguyên tắc

- API độc lập frontend. Web, Desktop, Mobile dùng chung `/api/v1`.
- D1 chỉ chứa metadata; việc chuyển media không thay đổi D1 và không lưu binary trong D1.
- Bucket B2 private không được client truy cập trực tiếp; mọi request đi qua Worker.
- Workers KV chỉ là fallback/local và nguồn dữ liệu trong giai đoạn migrate.
- Original giữ nguyên (EXIF không bị strip).
- Thumbnail / preview do client tạo, Worker lưu thành object riêng.
- Upload lớn chia chunk 8 MB, hỗ trợ pause/resume/retry bằng S3 multipart thật.
- Session dùng cookie HttpOnly; Desktop/Mobile có thể dùng `Authorization: Bearer`.

## Monorepo

| Path | Vai trò |
| --- | --- |
| `apps/web` | SPA React + Vite |
| `worker` | Hono trên Cloudflare Workers |
| `packages/api-types` | Type dùng chung client |
| `packages/shared` | MIME, format, moments, ZIP safety |
| `packages/validation` | Zod schema dùng cả 2 phía |
| `migrations` | D1 SQL |
| `scripts/kv-to-b2.mjs` | Migration KV → B2 có cursor/retry/resume |

## Upload và object layout

```
Browser  →  POST /uploads (auth + checksum + EXIF)
         ←  uploadId + chunkSize  |  duplicate media
Browser  →  PUT  /uploads/:id/parts/:n   (8 MB)
         →  POST /uploads/:id/complete
         →  PUT  /uploads/:id/thumb
Worker   →  B2 Create/UploadPart/CompleteMultipartUpload
         →  D1 media + version + audit
```

Storage key giữ nguyên dạng `u/{userId}/o/{mediaId}/{original,thumb,preview}.*`. Adapter thống nhất nhận toàn bộ Worker env: khi đủ cấu hình B2 nó dùng S3 API; nếu chưa đủ nó dùng layout KV cũ (file nhỏ là một value, file lớn có manifest và part dưới `__anp/parts/`). Nhờ vậy có thể rollout và rollback mà không sửa metadata D1.

## Media serving

`GET /api/v1/media/:id/{thumb,preview,file}` kiểm tra session hoặc share token rồi stream từ storage đã chọn. B2 dùng `GetObject`; Range request được chuẩn hóa theo `HeadObject` để phát video và tải tiếp. Bucket không có public URL trong ứng dụng.

## Private Vault

PIN 6 số hash PBKDF2. Cookie `anp_vault` ngắn hạn. Media `is_private=1` bị loại khỏi thư viện/share thường. Script migrate chỉ lấy Private Vault khi người vận hành chủ động dùng `--include-private` với vault token còn hiệu lực.

## Khoảnh khắc & kỷ niệm

Không AI. Gom ảnh theo khoảng thời gian 6 giờ và khoảng cách GPS 10 km. On this day: cùng ngày-tháng các năm trước.
