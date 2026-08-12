import { useQueryClient } from "@tanstack/react-query";
import { api, apiBlob } from "../../lib/api";
import { useUi } from "../../store/ui";
import { useToast } from "../../store/toast";
import { Button } from "../common/Ui";
import { Icon } from "../common/Icons";

export function SelectionBar() {
  const selected = useUi((s) => s.selected);
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  if (!selected.size) return null;
  const ids = [...selected];

  async function fav() {
    await api("/media/batch/favorite?value=1", { method: "POST", body: JSON.stringify({ ids }) });
    toast("success", `Đã thích ${ids.length} mục`);
    qc.invalidateQueries({ queryKey: ["media"] });
  }
  async function del() {
    await api("/media/batch/delete", { method: "POST", body: JSON.stringify({ ids }) });
    toast("success", "Đã chuyển vào thùng rác");
    useUi.getState().clearSelect();
    qc.invalidateQueries({ queryKey: ["media"] });
  }
  async function download() {
    toast("info", "Đang chuẩn bị tải xuống…");
    for (const id of ids.slice(0, 30)) {
      try {
        const blob = await apiBlob(`/media/${id}/file?dl=1`);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${id}`;
        a.click();
      } catch {
        /* skip */
      }
    }
  }

  return (
    <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-elev px-3 py-2 shadow-lift hairline md:bottom-6">
      <span className="px-2 text-sm">{ids.length} mục đã chọn</span>
      <Button variant="ghost" onClick={fav}>
        <Icon.Star size={16} /> Yêu thích
      </Button>
      <Button variant="ghost" onClick={() => useUi.getState().openAlbum(ids)}>
        <Icon.Album size={16} /> Album
      </Button>
      <Button variant="ghost" onClick={() => useUi.getState().openShare(ids)}>
        <Icon.Link size={16} /> Chia sẻ
      </Button>
      <Button variant="ghost" onClick={download}>
        <Icon.Download size={16} /> Tải xuống
      </Button>
      <Button variant="danger" onClick={del}>
        <Icon.Trash size={16} /> Xóa
      </Button>
      <Button variant="ghost" onClick={() => useUi.getState().clearSelect()}>
        <Icon.Close size={16} />
      </Button>
    </div>
  );
}
