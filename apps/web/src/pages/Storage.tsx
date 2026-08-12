import { useQuery } from "@tanstack/react-query";
import type { StorageBreakdown } from "@anp/api-types";
import { formatBytes } from "@anp/shared";
import { api } from "../lib/api";
import { PageHead } from "./Library";
import { Stat } from "../components/common/Ui";
import { useUi } from "../store/ui";

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
