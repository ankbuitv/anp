import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Album, Media } from "@anp/api-types";
import { api } from "../lib/api";
import { PageHead } from "./Library";
import { Button, Empty, Input, Modal } from "../components/common/Ui";
import { useToast } from "../store/toast";
import { useUi } from "../store/ui";
import JSZip from "jszip";

export function Albums() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const q = useQuery({ queryKey: ["albums"], queryFn: () => api<{ items: Album[] }>("/albums") });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  async function create() {
    await api("/albums", { method: "POST", body: JSON.stringify({ name, description: desc }) });
    setOpen(false);
    setName("");
    setDesc("");
    qc.invalidateQueries({ queryKey: ["albums"] });
    toast("success", "Đã tạo album");
  }

  return (
    <>
      <PageHead title="Album" extra={<Button onClick={() => setOpen(true)}>Tạo album</Button>} />
      <div
        className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 lg:grid-cols-4"
        onDragOver={(e) => e.preventDefault()}
      >
        {(q.data?.items ?? []).map((a) => (
          <AlbumCard key={a.id} album={a} />
        ))}
      </div>
      {!q.data?.items.length && !q.isLoading ? <Empty title="Chưa có album." body="Tạo album để nhóm chuyến đi, sự kiện, gia đình." /> : null}
      <Modal open={open} title="Album mới" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Input placeholder="Tên" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Mô tả" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Button className="w-full" onClick={() => name && void create()}>
            Tạo
          </Button>
        </div>
      </Modal>
    </>
  );
}

function AlbumCard({ album }: { album: Album }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  return (
    <div
      className="overflow-hidden rounded-2xl bg-elev hairline"
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("application/x-anp-media");
        if (!id) return;
        await api(`/albums/${album.id}/items`, { method: "POST", body: JSON.stringify({ mediaIds: [id] }) });
        toast("success", `Đã thêm vào ${album.name}`);
        qc.invalidateQueries({ queryKey: ["albums"] });
      }}
    >
      <button className="block w-full" onClick={() => nav(`/albums/${album.id}`)}>
        {album.coverUrl ? <img src={album.coverUrl} alt="" className="h-40 w-full object-cover" /> : <div className="flex h-40 items-center justify-center text-mute">Trống</div>}
      </button>
      <div className="p-3">
        <div className="font-medium">{album.name}</div>
        <div className="text-xs text-mute">{album.mediaCount} mục</div>
      </div>
    </div>
  );
}

export function AlbumDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const q = useQuery({
    queryKey: ["album", id],
    enabled: !!id,
    queryFn: () => api<{ album: Album; items: Media[] }>(`/albums/${id}/media`),
  });
  const [rename, setRename] = useState(false);
  const [name, setName] = useState("");

  async function save() {
    await api(`/albums/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    setRename(false);
    qc.invalidateQueries({ queryKey: ["album", id] });
  }
  async function remove() {
    if (!confirm("Xóa album này? Media vẫn còn trong thư viện.")) return;
    await api(`/albums/${id}`, { method: "DELETE" });
    toast("success", "Đã xóa album");
    location.href = "/albums";
  }
  async function exportZip() {
    if (!q.data?.items.length) return;
    toast("info", "Đang đóng gói ZIP…");
    const zip = new JSZip();
    const folder = zip.folder("Photos")!;
    let i = 0;
    for (const m of q.data.items.slice(0, 400)) {
      try {
        const res = await fetch(m.fileUrl, { credentials: "include" });
        if (!res.ok) continue;
        folder.file(m.originalName || `${m.id}.bin`, await res.arrayBuffer());
        i++;
      } catch {}
    }
    zip.file("metadata.json", JSON.stringify(q.data.items.map((m) => ({ id: m.id, name: m.originalName, checksum: m.checksum })), null, 2));
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ANP_Album_${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    toast("success", `Đã xuất ${i} file`);
    await api("/jobs/export", { method: "POST", body: JSON.stringify({ albumId: id, scope: "album" }) });
  }

  const a = q.data?.album;
  const items = q.data?.items ?? [];

  return (
    <>
      <PageHead
        title={a?.name || "Album"}
        extra={
          <div className="flex gap-2">
            <Button variant="line" onClick={() => useUi.getState().openShare(items.map((m) => m.id))}>
              Chia sẻ
            </Button>
            <Button variant="line" onClick={() => void exportZip()}>
              Xuất ZIP
            </Button>
            <Button variant="line" onClick={() => { setName(a?.name || ""); setRename(true); }}>
              Đổi tên
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Xóa
            </Button>
          </div>
        }
      />
      <p className="px-6 text-sm text-mute">{a?.description}</p>
      {!items.length ? (
        <Empty title="Album chưa có media." />
      ) : (
        <div className="grid grid-cols-3 gap-1 p-4 sm:grid-cols-5 md:grid-cols-6">
          {items.map((m, i) => (
            <button key={m.id} className="aspect-square overflow-hidden rounded-lg" onClick={() => useUi.getState().openViewer(items.map((x) => x.id), i)}>
              <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <Modal open={rename} title="Đổi tên album" onClose={() => setRename(false)}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button className="mt-3 w-full" onClick={() => void save()}>
          Lưu
        </Button>
      </Modal>
      <div className="px-6 pb-8 text-xs text-mute">
        <Link to="/albums">← Tất cả album</Link>
      </div>
    </>
  );
}
