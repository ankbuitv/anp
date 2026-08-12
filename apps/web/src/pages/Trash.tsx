import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHead } from "./Library";
import { Gallery } from "../components/media/Gallery";
import { Button } from "../components/common/Ui";
import { useUi } from "../store/ui";
import { useToast } from "../store/toast";

export function Trash() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const selected = [...useUi((s) => s.selected)];

  async function restore(ids: string[]) {
    await api("/trash/restore", { method: "POST", body: JSON.stringify({ ids }) });
    toast("success", "Đã khôi phục");
    useUi.getState().clearSelect();
    qc.invalidateQueries({ queryKey: ["media"] });
  }
  async function purge(all = false) {
    if (!confirm(all ? "Xóa vĩnh viễn toàn bộ thùng rác?" : "Xóa vĩnh viễn mục đã chọn?")) return;
    await api("/trash/purge", { method: "POST", body: JSON.stringify(all ? { all: true } : { ids: selected }) });
    toast("success", "Đã xóa vĩnh viễn");
    useUi.getState().clearSelect();
    qc.invalidateQueries({ queryKey: ["media"] });
  }

  return (
    <>
      <PageHead
        title="Thùng rác"
        extra={
          <div className="flex gap-2">
            <Button variant="line" disabled={!selected.length} onClick={() => void restore(selected)}>
              Khôi phục
            </Button>
            <Button variant="danger" disabled={!selected.length} onClick={() => void purge(false)}>
              Xóa vĩnh viễn
            </Button>
            <Button variant="danger" onClick={() => void purge(true)}>
              Dọn hết
            </Button>
          </div>
        }
      />
      <Gallery queryKey={["trash"]} query={{ trash: "1" }} emptyTitle="Thùng rác đang trống." />
    </>
  );
}
