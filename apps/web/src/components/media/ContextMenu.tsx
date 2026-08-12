import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../store/ui";
import { useToast } from "../../store/toast";

export function ContextMenu() {
  const ctx = useUi((s) => s.context);
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);

  useEffect(() => {
    if (!ctx) return;
    const close = () => useUi.getState().setContext(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [ctx]);

  if (!ctx) return null;
  const m = ctx.media;
  const item = (label: string, fn: () => void) => (
    <button
      className="block w-full px-3 py-2 text-left text-sm hover:bg-line/10"
      onClick={(e) => {
        e.stopPropagation();
        fn();
        useUi.getState().setContext(null);
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed z-[60] min-w-[200px] overflow-hidden rounded-xl bg-elev py-1 shadow-lift hairline"
      style={{ left: Math.min(ctx.x, window.innerWidth - 220), top: Math.min(ctx.y, window.innerHeight - 280) }}
    >
      {item("Mở viewer", () => useUi.getState().openViewer([m.id], 0))}
      {item(m.isFavorite ? "Bỏ yêu thích" : "Yêu thích", async () => {
        await api(`/media/batch/favorite?value=${m.isFavorite ? "0" : "1"}`, {
          method: "POST",
          body: JSON.stringify({ ids: [m.id] }),
        });
        qc.invalidateQueries({ queryKey: ["media"] });
      })}
      {item("Thêm vào album", () => useUi.getState().openAlbum([m.id]))}
      {item("Chia sẻ", () => useUi.getState().openShare([m.id]))}
      {item("Tải xuống", () => {
        const a = document.createElement("a");
        a.href = `${m.fileUrl}?dl=1`;
        a.download = m.originalName;
        a.click();
      })}
      {item("Thông tin", () => useUi.getState().openViewer([m.id], 0))}
      {item("Xóa", async () => {
        await api("/media/batch/delete", { method: "POST", body: JSON.stringify({ ids: [m.id] }) });
        toast("success", "Đã chuyển vào thùng rác");
        qc.invalidateQueries({ queryKey: ["media"] });
      })}
    </div>
  );
}
