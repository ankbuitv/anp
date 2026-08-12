import { useQuery } from "@tanstack/react-query";
import type { BackupSession } from "@anp/api-types";
import { formatBytes } from "@anp/shared";
import { api } from "../lib/api";
import { PageHead } from "./Library";
import { Button } from "../components/common/Ui";
import { formatDateTime } from "../lib/format";
import { useToast } from "../store/toast";

export function Backup() {
  const q = useQuery({ queryKey: ["backup"], queryFn: () => api<{ items: BackupSession[] }>("/backup") });
  const toast = useToast((s) => s.push);

  return (
    <>
      <PageHead title="Sao lưu" />
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <div className="rounded-2xl bg-elev p-5 hairline">
          <h2 className="font-display text-xl">Nền tảng Auto Backup</h2>
          <p className="mt-2 text-sm text-mute">
            Web tạo phiên sao lưu, kiểm tra checksum và ghi tiến độ. Desktop (Windows) và Mobile sẽ dùng cùng API này để tự động
            backup thư mục / Camera Roll — không tải lại file trùng.
          </p>
          <Button
            className="mt-4"
            onClick={async () => {
              await api("/backup", { method: "POST", body: JSON.stringify({ totalFiles: 0 }) });
              toast("success", "Đã tạo phiên sao lưu (foundation)");
              q.refetch();
            }}
          >
            Tạo phiên backup
          </Button>
        </div>
        {(q.data?.items ?? []).map((s) => (
          <div key={s.id} className="rounded-xl bg-elev/70 px-4 py-3 text-sm hairline">
            <div className="flex justify-between">
              <span className="uppercase tracking-wider text-mute">{s.status}</span>
              <span className="text-mute">{formatDateTime(s.createdAt)}</span>
            </div>
            <div className="mt-1">
              {s.completedFiles}/{s.totalFiles} file · {formatBytes(s.bytesDone)} / {formatBytes(s.bytesTotal)} · bỏ qua {s.skippedFiles} · lỗi {s.failedFiles}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
