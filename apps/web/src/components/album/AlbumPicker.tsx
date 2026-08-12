import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Album } from "@anp/api-types";
import { api } from "../../lib/api";
import { useUi } from "../../store/ui";
import { useToast } from "../../store/toast";
import { Button, Input, Modal } from "../common/Ui";

export function AlbumPicker() {
  const open = useUi((s) => s.albumOpen);
  const ids = useUi((s) => s.albumTargets);
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const albums = useQuery({ queryKey: ["albums"], queryFn: () => api<{ items: Album[] }>("/albums"), enabled: open });
  const [name, setName] = useState("");

  async function add(albumId: string) {
    await api(`/albums/${albumId}/items`, { method: "POST", body: JSON.stringify({ mediaIds: ids }) });
    toast("success", "Đã thêm vào album");
    qc.invalidateQueries({ queryKey: ["albums"] });
    qc.invalidateQueries({ queryKey: ["media"] });
    useUi.setState({ albumOpen: false });
  }
  async function create() {
    const res = await api<{ album: Album }>("/albums", { method: "POST", body: JSON.stringify({ name }) });
    await add(res.album.id);
    setName("");
  }

  return (
    <Modal open={open} title="Thêm vào album" onClose={() => useUi.setState({ albumOpen: false })}>
      <div className="mb-3 flex gap-2">
        <Input placeholder="Tên album mới" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={() => name && void create()}>Tạo</Button>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {(albums.data?.items ?? []).map((a) => (
          <button key={a.id} onClick={() => void add(a.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-line/10">
            {a.coverUrl ? <img src={a.coverUrl} className="h-10 w-10 rounded-lg object-cover" alt="" /> : <div className="h-10 w-10 rounded-lg bg-ink/40" />}
            <div>
              <div className="text-sm">{a.name}</div>
              <div className="text-xs text-mute">{a.mediaCount} mục</div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
