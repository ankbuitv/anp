import { useQuery } from "@tanstack/react-query";
import type { StorageBackendInfo, StorageBreakdown } from "@anp/api-types";
import { formatBytes } from "@anp/shared";
import { api } from "../lib/api";
import { PageHead } from "./Library";
import { Stat } from "../components/common/Ui";
import { useUi } from "../store/ui";

function BackendCard({ b }: { b: StorageBackendInfo }) {
  const label =
    b.provider === "b2" ? `Backblaze B2 · ${b.bucket ?? "—"}` : b.provider === "kv" ? "Workers KV (dự phòng)" : "Chưa cấu hình";
  return (
    <div className="rounded-2xl bg-elev p-4 hairline">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${b.healthy ? "bg-ok" : "bg-danger"}`} />
        <span className="text-sm font-medium">Nơi lưu trữ: {label}</span>
        {b.bytes != null ? (
          <span className="text-xs text-mute">
            · {formatBytes(b.bytes)} thực tế trên bucket
            {b.objects != null ? ` · ${b.objects} object` : ""}
            {b.truncated ? " (đã cắt bớt)" : ""}
          </span>
        ) : null}
      </div>
      {b.message ? <p className="mt-2 text-xs text-danger">{b.message}</p> : null}
      {b.provider === "kv" ? (
        <p className="mt-2 text-xs text-mute">
          Đang dùng Workers KV nên file lớn có thể tải lên lỗi. Đặt B2_KEY_ID và B2_APP_KEY để chuyển sang Backblaze B2.
        </p>
      ) : null}
    </div>
  );
}

export function Storage() {
  const q = useQuery({ queryKey: ["storage"], queryFn: () => api<StorageBreakdown>("/storage") });
  const d = q.data;
  const total = d?.total.bytes || 1;
  const bars = [
    { l: "Ảnh", v: d?.images.bytes ?? 0, c: "bg-bronze" },
    { l: "Video", v: d?.videos.bytes ?? 0, c: "bg-ok" },
    { l: "Thumbnail", v: d?.thumbs.bytes ?? 0, c: "bg-mute" },
  ];

  return (
    <>
      <PageHead title="Dung lượng" />
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Tổng" value={d ? formatBytes(d.total.bytes) : "—"} hint={`${d?.total.count ?? 0} file`} />
          <Stat label="Ảnh" value={d ? formatBytes(d.images.bytes) : "—"} hint={`${d?.images.count ?? 0}`} />
          <Stat label="Video" value={d ? formatBytes(d.videos.bytes) : "—"} hint={`${d?.videos.count ?? 0}`} />
          <Stat label="Thumbnail" value={d ? formatBytes(d.thumbs.bytes) : "—"} />
        </div>
        {d?.backend ? <BackendCard b={d.backend} /> : null}
        <div className="h-4 overflow-hidden rounded-full bg-elev">
          <div className="flex h-full">
            {bars.map((b) => (
              <div key={b.l} className={b.c} style={{ width: `${(b.v / total) * 100}%` }} title={b.l} />
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-2 font-display text-xl">File lớn nhất</h2>
          <div className="divide-y divide-line/10 rounded-2xl bg-elev hairline">
            {(d?.largest ?? []).map((f) => (
              <button key={f.id} className="flex w-full items-center justify-between px-4 py-2 text-left text-sm" onClick={() => useUi.getState().openViewer([f.id], 0)}>
                <span className="truncate">{f.filename}</span>
                <span className="text-mute">{formatBytes(f.size)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
