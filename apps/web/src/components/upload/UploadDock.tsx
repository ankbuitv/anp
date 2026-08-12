import { useEffect, useState } from "react";
import { formatBytes, formatEta, formatSpeed } from "@anp/shared";
import { uploads } from "../../lib/upload";
import { Button, cn } from "../common/Ui";
import { Icon } from "../common/Icons";

export function UploadDock() {
  const [, tick] = useState(0);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    return uploads.subscribe(() => tick((n) => n + 1));
  }, []);
  const items = uploads.items;
  if (!items.length) return null;
  const s = uploads.stats();
  return (
    <div className="fixed bottom-20 right-4 z-40 w-[min(92vw,400px)] overflow-hidden rounded-2xl bg-elev shadow-lift hairline md:bottom-6">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1">
          <div className="text-sm font-medium">Đang tải lên</div>
          <div className="text-xs text-mute">
            {s.done} / {s.total} · {formatBytes(s.uploaded)} / {formatBytes(s.totalBytes)}
          </div>
        </div>
        <button className="text-mute" onClick={() => setOpen((v) => !v)}>
          {open ? "▾" : "▴"}
        </button>
      </div>
      <div className="h-1 bg-line/10">
        <div className="h-full bg-bronze transition-all" style={{ width: `${s.totalBytes ? (s.uploaded / s.totalBytes) * 100 : 0}%` }} />
      </div>
      <div className="flex justify-between px-3 py-1.5 text-[11px] text-mute">
        <span>{formatSpeed(s.speed)}</span>
        <span>Còn khoảng {formatEta(s.eta)}</span>
      </div>
      {open ? (
        <div className="max-h-56 overflow-y-auto border-t border-line/10">
          {items.slice(-12).map((it) => (
            <div key={it.localId} className="px-3 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate">{it.name}</div>
                <div className={cn("w-20 text-right text-mute", it.status === "error" && "text-danger")}>
                  {it.status === "done" || it.status === "duplicate" ? "xong" : it.status === "error" ? "lỗi" : `${Math.round(it.progress * 100)}%`}
                </div>
                {it.status === "error" ? (
                  <button onClick={() => uploads.retry(it.localId)} className="text-bronze">
                    Thử lại
                  </button>
                ) : it.status !== "done" && it.status !== "duplicate" ? (
                  <button onClick={() => uploads.cancel(it.localId)} className="text-mute">
                    <Icon.Close size={12} />
                  </button>
                ) : null}
              </div>
              {/* Hiện nguyên nhân thật để phân biệt lỗi cấu hình B2, hết hạn phiên hay file quá lớn. */}
              {it.status === "error" && it.error ? (
                <p className="mt-1 text-[11px] leading-snug text-danger" title={it.error}>
                  {it.error}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex gap-1 border-t border-line/10 p-2">
        <Button variant="line" className="flex-1 text-xs" onClick={() => (uploads.paused ? uploads.resumeAll() : uploads.pauseAll())}>
          {uploads.paused ? "Tiếp tục" : "Tạm dừng"}
        </Button>
        <Button variant="ghost" className="text-xs" onClick={() => uploads.clearFinished()}>
          Xóa mục xong
        </Button>
      </div>
    </div>
  );
}
