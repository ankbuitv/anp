import { useQuery } from "@tanstack/react-query";
import type { MemoryDay, Moment } from "@anp/api-types";
import { api } from "../lib/api";
import { useUi } from "../store/ui";
import { PageHead } from "./Library";
import { Empty, Input } from "../components/common/Ui";
import { formatDate } from "../lib/format";
import { useState } from "react";

export function Memories() {
  const mem = useQuery({ queryKey: ["memories"], queryFn: () => api<{ today: string; items: MemoryDay[] }>("/media/memories") });
  const moments = useQuery({ queryKey: ["moments"], queryFn: () => api<{ items: Moment[] }>("/moments") });

  return (
    <>
      <PageHead title="Kỷ niệm" extra={<Rebuild />} />
      <div className="space-y-8 p-4 md:p-6">
        <section>
          <h2 className="font-display text-2xl">Hôm nay những năm trước</h2>
          {!mem.data?.items.length ? (
            <p className="mt-2 text-sm text-mute">Chưa có ảnh cùng ngày ở các năm trước.</p>
          ) : (
            <div className="mt-4 space-y-6">
              {mem.data.items.map((g) => (
                <div key={g.year}>
                  <div className="mb-2 text-sm text-mute">
                    Hôm nay {g.yearsAgo} năm trước · {g.count} ảnh
                  </div>
                  <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
                    {g.items.map((m, i) => (
                      <button key={m.id} className="aspect-square overflow-hidden rounded-lg" onClick={() => useUi.getState().openViewer(g.items.map((x) => x.id), i)}>
                        <img src={m.thumbUrl} className="h-full w-full object-cover" alt="" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section>
          <h2 className="font-display text-2xl">Khoảnh khắc</h2>
          <p className="mt-1 text-sm text-mute">Nhóm theo ngày, giờ và GPS — không dùng AI.</p>
          {!moments.data?.items.length ? (
            <Empty title="Chưa có khoảnh khắc." body="Tải nhiều ảnh gần nhau về thời gian hoặc vị trí để ANP tự nhóm." />
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {moments.data.items.map((m) => (
                <MomentCard key={m.id} m={m} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Rebuild() {
  return (
    <button
      className="text-xs text-mute hover:text-paper"
      onClick={async () => {
        await api("/moments/rebuild", { method: "POST" });
        location.reload();
      }}
    >
      Gom lại khoảnh khắc
    </button>
  );
}

function MomentCard({ m }: { m: Moment }) {
  const [name, setName] = useState(m.name);
  return (
    <div className="overflow-hidden rounded-2xl bg-elev hairline">
      {m.coverUrl ? <img src={m.coverUrl} className="h-36 w-full object-cover" alt="" /> : null}
      <div className="p-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== m.name && api(`/moments/${m.id}`, { method: "PATCH", body: JSON.stringify({ name }) })}
        />
        <div className="mt-2 text-xs text-mute">
          {formatDate(m.startAt)} {m.endAt && m.endAt !== m.startAt ? `– ${formatDate(m.endAt)}` : ""} · {m.mediaCount} media
        </div>
      </div>
    </div>
  );
}
