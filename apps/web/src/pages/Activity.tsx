import { useQuery } from "@tanstack/react-query";
import type { AuditLog } from "@anp/api-types";
import { api } from "../lib/api";
import { PageHead } from "./Library";
import { Empty } from "../components/common/Ui";
import { actionLabel, formatDateTime } from "../lib/format";

export function Activity() {
  const q = useQuery({ queryKey: ["activity"], queryFn: () => api<{ items: AuditLog[] }>("/activity") });
  return (
    <>
      <PageHead title="Nhật ký" />
      {!q.data?.items.length ? <Empty title="Chưa có hoạt động." /> : null}
      <div className="mx-auto max-w-3xl divide-y divide-line/10 p-4">
        {(q.data?.items ?? []).map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-3 py-3 text-sm">
            <div>
              <div>{actionLabel(a.action)}</div>
              <div className="text-xs text-mute">{a.entityType}</div>
            </div>
            <div className="text-right text-xs text-mute">
              <div>{formatDateTime(a.createdAt)}</div>
              <div>{a.ip || ""}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
