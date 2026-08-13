# Phase 3 — Mobile (iOS + Android)

App **.NET MAUI** (`mobile-app/`), dùng chung `/api/v1`. UI tiếng Việt, theme đồng bộ web (dark mặc định, bronze).

## Đã có (v0.1)

- Đăng ký / đăng nhập / đăng xuất, phiên lưu trong **SecureStorage** (cookie `anp_session`), tự khôi phục khi mở lại app
- Đăng nhập ghi thiết bị (`android`/`ios` + tên máy) vào `/devices`; register nhận `deviceName/deviceType/platform`
- Gallery: grid 3 cột, cursor pagination vô hạn, pull-to-refresh, tìm kiếm, filter Tất cả / Ảnh / Video / Yêu thích
- Thumbnail tải qua HttpClient (có cookie) + cache 2 lớp (RAM + đĩa, tách theo tài khoản)
- Viewer fullscreen: vuốt ngang, pinch-zoom ảnh, video phát từ file local (tải có progress, resume bằng Range)
- Thông tin EXIF / GPS / album / checksum (MediaDetailPage)
- Chọn nhiều: yêu thích, vào/ra Private Vault, xóa (vào thùng rác)
- Upload: chụp ảnh, chọn ảnh/video, hàng đợi resume theo checksum + part 8 MB, trùng lặp bị bỏ qua, progress từng file, pause/resume, sinh thumbnail JPEG 360px native (Android/iOS)
- Album: tạo, đổi tên, xóa, xem media trong album, thêm media vào album
- Private Vault: đặt PIN 6 số, mở/khóa, xem kho riêng, upload thẳng vào Vault
- Cài đặt: dung lượng + trạng thái B2, đổi máy chủ API (test local), theme sáng/tối/hệ thống, đăng xuất
- Lưu ảnh/video về thư viện máy (MediaStore / Photos) + share sheet

## Còn lại (roadmap)

- Background backup: tự động sao lưu ảnh mới, chỉ Wi-Fi, chỉ khi sạc (Android WorkManager / iOS BGTask)
- Thumbnail video khi upload (MediaMetadataRetriever / AVAssetImageGenerator)
- Xem share công khai (link /share/…) và nhận ANP Drop
- Thùng rác (khôi phục / xóa vĩnh viễn), kỷ niệm, lịch, bản đồ
- Đổi PIN, đổi mật khẩu, quản lý thiết bị
- LAN transfer + Bluetooth pairing + QR pairing
- Upload chọn thêm preview 1600px cho ảnh (web đã có; mobile chỉ thumb để tiết kiệm pin)

## Build

Cần .NET 9 SDK + MAUI workload (`maui-android` / `maui-ios` / `maui-maccatalyst`). CI: `.github/workflows/mobile.yml` build APK Android và build iOS/MacCatalyst không ký.

```bash
dotnet workload install maui-android   # hoặc maui-ios trên macOS
cd mobile-app
dotnet build AnpMobile.csproj -f net9.0-android -c Release
```
