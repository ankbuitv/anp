export function formatDateTime(ms: number | null | undefined): string {
  if (!ms) return "Không có thông tin.";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);
}

export function formatDate(ms: number | null | undefined): string {
  if (!ms) return "Không có thông tin.";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(ms);
}

export function formatDayHeading(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (start(today) - start(d)) / 86400000;
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Hôm qua";
  return new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function relativeTime(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "Vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} ngày trước`;
  return formatDate(ms);
}

export function actionLabel(action: string): string {
  const map: Record<string, string> = {
    register: "Đăng ký tài khoản",
    login: "Đăng nhập",
    logout: "Đăng xuất",
    upload: "Tải lên media",
    trash: "Chuyển vào thùng rác",
    restore: "Khôi phục",
    purge: "Xóa vĩnh viễn",
    album_create: "Tạo album",
    album_delete: "Xóa album",
    share_create: "Tạo chia sẻ",
    share_revoke: "Thu hồi chia sẻ",
    export: "Xuất dữ liệu",
    password_change: "Đổi mật khẩu",
    vault_pin_set: "Đặt PIN Vault",
    vault_unlock: "Mở Private Vault",
    backup_start: "Bắt đầu sao lưu",
    backup_complete: "Kết thúc sao lưu",
    session_revoke: "Đăng xuất phiên",
    device_revoke: "Gỡ thiết bị",
  };
  return map[action] || action;
}
