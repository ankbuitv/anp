import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Device, SessionInfo } from "@anp/api-types";
import { api } from "../lib/api";
import { PageHead } from "./Library";
import { Button } from "../components/common/Ui";
import { formatDateTime } from "../lib/format";
import { useToast } from "../store/toast";

export function Devices() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const q = useQuery({
    queryKey: ["devices"],
    queryFn: () => api<{ devices: Device[]; sessions: SessionInfo[] }>("/devices"),
  });

  return (
    <>
      <PageHead title="Thiết bị" />
      <div className="mx-auto max-w-3xl space-y-6 p-4">
        <section>
          <h2 className="mb-2 font-display text-xl">Thiết bị</h2>
          {(q.data?.devices ?? []).map((d) => (
            <div key={d.id} className="mb-2 flex items-center justify-between rounded-xl bg-elev px-4 py-3 hairline">
              <div>
                <div className="text-sm">{d.name}</div>
                <div className="text-xs text-mute">
                  {d.type} · {formatDateTime(d.lastActiveAt)}
                </div>
              </div>
              <Button
                variant="danger"
                onClick={async () => {
                  await api(`/devices/${d.id}`, { method: "DELETE" });
                  toast("success", "Đã gỡ thiết bị");
                  qc.invalidateQueries({ queryKey: ["devices"] });
                }}
              >
                Đăng xuất thiết bị
              </Button>
            </div>
          ))}
        </section>
        <section>
          <h2 className="mb-2 font-display text-xl">Phiên đăng nhập</h2>
          {(q.data?.sessions ?? []).map((s) => (
            <div key={s.id} className="mb-2 flex items-center justify-between rounded-xl bg-elev/60 px-4 py-3 text-sm hairline">
              <div>
                <div>{s.current ? "Phiên hiện tại" : s.userAgent?.slice(0, 60)}</div>
                <div className="text-xs text-mute">{formatDateTime(s.lastActiveAt)}</div>
              </div>
              {!s.current ? (
                <Button
                  variant="line"
                  onClick={async () => {
                    await api(`/devices/sessions/${s.id}`, { method: "DELETE" });
                    qc.invalidateQueries({ queryKey: ["devices"] });
                  }}
                >
                  Đăng xuất
                </Button>
              ) : null}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
