import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CleanupReport } from "@anp/api-types";
import { formatBytes } from "@anp/shared";
import { api } from "../lib/api";
import { PageHead } from "./Library";
import { useUi } from "../store/ui";

export function Cleanup() {
  const q = useQuery({ queryKey: ["cleanup"], queryFn: () => api<CleanupReport>("/storage/cleanup") });
  const d = q.data;
  const dupFiles = d?.duplicates.reduce((a, g) => a + g.count, 0) ?? 0;

  return (
    <>
      <PageHead title="Dọn dẹp" extra={<span className="text-xs text-mute">ANP không tự xóa. Bạn quyết định.</span>} />
      <div className="grid gap-3 p-4 md:grid-cols-2 md:p-6">
        <Card warn={`${dupFiles} file trùng`} to="/cleanup#dup" />
        <Card warn={`${d?.largeVideos.length ?? 0} video &gt; 1 GB`} />
        <Card warn={`${d?.unalbumed.count ?? 0} ảnh chưa vào album`} to="/albums" />
        <Card warn={`${d?.trash.count ?? 0} file trong thùng rác`} to="/trash" />
        <Card warn={`${d?.old.count ?? 0} file cũ hơn 1 năm`} />
        <Card warn={`${d?.largeFiles.length ?? 0} file lớn`} />
      </div>
      <div id="dup" className="space-y-4 px-4 pb-10 md:px-6">
        <h2 className="font-display text-2xl">File trùng (checksum)</h2>
        {(d?.duplicates ?? []).map((g) => (
          <div key={g.checksum} className="rounded-2xl bg-elev p-4 hairline">
            <div className="text-sm">
              {g.count} bản · {formatBytes(g.size)} · <span className="font-mono text-xs text-mute">{g.checksum.slice(0, 16)}…</span>
            </div>
            <div className="mt-2 flex gap-2">
              {g.ids.slice(0, 8).map((id) => (
                <button key={id} onClick={() => useUi.getState().openViewer(g.ids, g.ids.indexOf(id))} className="rounded-lg bg-ink/40 px-2 py-1 font-mono text-[10px]">
                  {id.slice(0, 8)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Card({ warn, to }: { warn: string; to?: string }) {
  const inner = (
    <div className="rounded-2xl bg-elev p-5 hairline">
      <div className="text-bronze">⚠</div>
      <div className="mt-2 text-lg" dangerouslySetInnerHTML={{ __html: warn }} />
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}
