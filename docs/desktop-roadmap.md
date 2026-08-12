# Phase 2 — Desktop

Không nằm trong scope Phase 1. Backend đã có:

- `POST /api/v1/auth/login` + Bearer
- `/devices`
- `/backup` session, checksum check, progress, complete
- `/uploads` resume theo checksum
- `/drop`

## Ưu tiên Windows

1. Auto Backup thư mục
2. Folder Sync (`D:\Pictures` → ANP, skip checksum trùng)
3. ANP Drive (virtual folder Photos / Videos / Albums / Shared / Private)
4. LAN Sync
5. ANP Drop
6. Right-click “Upload lên ANP”
7. Background upload
8. System tray

Mở đường macOS / Linux cùng API.
