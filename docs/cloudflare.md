# Cloudflare và media storage

## Dịch vụ

| Binding / biến | Loại | Tên / ID |
| --- | --- | --- |
| `DB` | Cloudflare D1 | `anp` / `f1ae2e6b-4450-47c5-953d-3a6fe5924442` |
| `ASSETS` | Worker assets | `apps/web/dist` |
| `MEDIA` | Workers KV fallback | `6fe12765c4714494ae4a0827393a0c78` |
| `B2_BUCKET` | Backblaze B2 private | `anp-media` |
| `B2_ENDPOINT` | S3 endpoint | `https://s3.us-east-005.backblazeb2.com` |

D1 chỉ giữ metadata và không thay đổi khi chuyển storage. Media production nằm trong B2 private; mọi đọc/ghi vẫn qua Worker sau khi kiểm tra session hoặc share token. KV được giữ tạm làm nguồn migrate, rollback và storage local.

## Cấu hình B2

Tạo **Application Key con** trên Backblaze, giới hạn duy nhất bucket `anp-media` và chỉ cấp List/Read/Write/Delete. Không dùng hoặc chia sẻ master application key. Lưu hai giá trị bằng Wrangler secrets, không đặt trong `wrangler.toml`:

```bash
npx wrangler secret put B2_KEY_ID
npx wrangler secret put B2_APP_KEY
```

Các biến không bí mật `B2_BUCKET`, `B2_ENDPOINT`, `B2_REGION` đã có trong `wrangler.toml`. Adapter chỉ chọn B2 khi đủ cả bucket, endpoint, key ID và app key; nếu thiếu sẽ dùng `MEDIA` KV.

### Thứ tự ưu tiên khi ghi

B2 là nơi ghi chính khi đã cấu hình đủ bốn giá trị trên. KV chỉ còn hai vai trò: nguồn đọc cho dữ liệu cũ chưa migrate, và lưới an toàn khi B2 từ chối ghi (sai key, thiếu quyền `writeFiles`), để một credential hỏng không chặn toàn bộ upload. Mọi lần rơi vào lưới an toàn đều ghi `console.error` kèm key — kiểm tra bằng `npx wrangler tail`.

`B2_KEY_ID` phải là Application Key con giới hạn bucket. Master key (ID ngắn, ≤ 12 ký tự) bị từ chối ngay khi khởi tạo client, và trang **Dung lượng** sẽ hiện thẳng lý do đó thay vì báo lỗi chung chung.

### Kiểm tra nhanh khi upload lỗi

`GET /api/v1/storage` trả thêm khối `backend`: provider đang dùng, tên bucket, trạng thái kết nối, thông báo lỗi thật, cùng số object và bytes đo trực tiếp trên prefix `u/{userId}/` của B2. Trang Dung lượng hiển thị khối này ngay dưới các thẻ thống kê, nên số liệu B2 lệch so với D1 sẽ lộ ra ngay. Nếu cần quyền `listFiles` mà key không có, phần dung lượng để trống và báo thiếu quyền List, chứ không làm hỏng trang.

B2 dùng S3 multipart thật: `CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload` và `AbortMultipartUpload`. Chunk 8 MB lớn hơn mức tối thiểu 5 MB của S3 (trừ part cuối). Storage key giữ dạng `u/{userId}/o/{mediaId}/{original,thumb,preview}.*`.

Bucket đang bật “Keep all versions”; ghi đè/xóa có thể vẫn giữ version cũ và tiếp tục tính dung lượng. Nên đặt lifecycle phù hợp sau khi đã quyết định thời gian rollback.

## Local và tài nguyên Cloudflare

Khi không có B2 credentials, Wrangler dùng D1 + Workers KV local trong `.wrangler/`:

```bash
npx wrangler login
npx wrangler d1 create anp
npx wrangler kv namespace create MEDIA
npx wrangler d1 migrations apply anp --remote
```

Muốn local kết nối B2 thật, sao chép `.dev.vars.example` thành `.dev.vars` và chỉ điền key con giới hạn bucket. Không commit `.dev.vars`.

## Domain

Production: `https://p.ankb.qzz.io`

Gắn custom domain cho Worker trên dashboard (Workers → anp → Custom Domains) hoặc route zone. API là `https://p.ankb.qzz.io/api/v1/`. Client không cần CORS trực tiếp tới B2 vì chỉ gọi Worker cùng origin.
