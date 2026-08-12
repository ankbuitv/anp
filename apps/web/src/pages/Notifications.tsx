import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@anp/api-types";
import { api } from "../lib/api";
import { PageHead } from "./Library";
import { Button, Empty } from "../components/common/Ui";
import { relativeTime } from "../lib/format";

export function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ unread: number; items: Notification[] }>("/notifications") });

  return (
    <>
      <PageHead
        title="Thông báo"
        extra={
          <Button
            variant="line"
            onClick={async () => {
              await api("/notifications/read", { method: "POST", body: "{}" });
              qc.invalidateQueries({ queryKey: ["notifications"] });
            }}
          >
            Đánh dấu tất cả đã đọc
          </Button>
        }
      />
      {!q.data?.items.length ? <Empty title="Chưa có thông báo." /> : null}
      <div className="mx-auto max-w-2xl space-y-2 p-4">
        {(q.data?.items ?? []).map((n) => (
          <div key={n.id} className={`rounded-2xl px-4 py-3 hairline ${n.readAt ? "bg-elev/40" : "bg-elev"}`}>
            <div className="flex justify-between gap-2">
              <div className="font-medium">{n.title}</div>
              <div className="text-xs text-mute">{relativeTime(n.createdAt)}</div>
            </div>
            {n.body ? <div className="mt-1 text-sm text-mute">{n.body}</div> : null}
          </div>
        ))}
      </div>
    </>
  );
}
