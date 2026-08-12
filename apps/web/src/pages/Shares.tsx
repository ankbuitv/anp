import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Share } from "@anp/api-types";
import { api } from "../lib/api";
import { PageHead } from "./Library";
import { Button, Empty } from "../components/common/Ui";
import { formatDateTime, relativeTime } from "../lib/format";
import { useToast } from "../store/toast";

export function Shares() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const q = useQuery({ queryKey: ["shares"], queryFn: () => api<{ items: Share[] }>("/shares") });

  async function revoke(id: string) {
    await api(`/shares/${id}`, { method: "DELETE" });
    toast("success", "Đã thu hồi chia sẻ");
    qc.invalidateQueries({ queryKey: ["shares"] });
  }

  return (
    <>
      <PageHead title="Chia sẻ" />
      {!q.data?.items.length && !q.isLoading ? <Empty title="Chưa có liên kết chia sẻ." /> : null}
      <div className="space-y-3 p-4 md:p-6">
        {(q.data?.items ?? []).map((s) => (
          <div key={s.id} className="rounded-2xl bg-elev p-4 hairline">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">{s.title || "Chia sẻ"}</div>
                <div className="font-mono text-sm text-bronze">{s.code}</div>
                <a href={s.url} className="text-xs text-mute underline" target="_blank" rel="noreferrer">
                  {s.url}
                </a>
              </div>
              <div className="text-right text-xs text-mute">
                <div>Quyền: {s.permission === "download" ? "Xem + Tải" : "Xem"}</div>
                <div>Hết hạn: {s.expiresAt ? formatDateTime(s.expiresAt) : "Không"}</div>
                <div className={s.revokedAt ? "text-danger" : ""}>{s.revokedAt ? "Đã thu hồi" : "Đang hoạt động"}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-mute">
              <div>Lượt xem · {s.viewCount}</div>
              <div>Lượt tải · {s.downloadCount}</div>
              <div>Gần nhất · {s.lastAccessedAt ? relativeTime(s.lastAccessedAt) : "—"}</div>
            </div>
            {!s.revokedAt ? (
              <Button variant="danger" className="mt-3" onClick={() => void revoke(s.id)}>
                Thu hồi
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
