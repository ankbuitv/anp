import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Album, Share } from "@anp/api-types";
import { api } from "../../lib/api";
import { useUi } from "../../store/ui";
import { useToast } from "../../store/toast";
import { Button, Input, Modal } from "../common/Ui";

export function ShareModal() {
  const open = useUi((s) => s.shareOpen);
  const targets = useUi((s) => s.shareTargets);
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const albums = useQuery({ queryKey: ["albums"], queryFn: () => api<{ items: Album[] }>("/albums"), enabled: open });
  const [title, setTitle] = useState("");
  const [permission, setPermission] = useState<"view" | "download">("view");
  const [days, setDays] = useState("");
  const [code, setCode] = useState("");
  const [albumId, setAlbumId] = useState("");
  const [created, setCreated] = useState<Share | null>(null);
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (!open) {
      setCreated(null);
      setTitle("");
      setCode("");
      setDays("");
    }
  }, [open]);

  useEffect(() => {
    if (created) QRCode.toDataURL(created.url, { margin: 1, width: 280, color: { dark: "#1c1914", light: "#f4f0e6" } }).then(setQr);
  }, [created]);

  async function submit() {
    const body: Record<string, unknown> = {
      type: albumId ? "album" : targets.length === 1 ? "media" : "selection",
      permission,
      title: title || undefined,
      accessCode: code || undefined,
      expiresInDays: days ? Number(days) : null,
    };
    if (albumId) body.albumId = albumId;
    else body.mediaIds = targets;
    const res = await api<{ share: Share }>("/shares", { method: "POST", body: JSON.stringify(body) });
    setCreated(res.share);
    qc.invalidateQueries({ queryKey: ["shares"] });
    toast("success", "Đã tạo liên kết chia sẻ");
  }

  return (
    <Modal open={open} title="Chia sẻ" onClose={() => useUi.setState({ shareOpen: false })}>
      {created ? (
        <div className="space-y-3">
          <div className="text-sm text-mute">{created.title}</div>
          <img src={qr} alt="QR" className="mx-auto w-44 rounded-xl" />
          <div className="rounded-xl bg-ink/40 px-3 py-2 font-mono text-sm hairline">{created.url}</div>
          <div className="text-center font-mono text-lg tracking-[0.2em]">{created.code}</div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigator.clipboard.writeText(created.url)}>Sao chép link</Button>
            <Button variant="line" onClick={() => navigator.clipboard.writeText(created.code)}>
              Sao chép mã
            </Button>
            <a href={qr} download={`ANP-QR-${created.code}.png`}>
              <Button variant="line">Tải QR</Button>
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Input placeholder="Tiêu đề (tuỳ chọn)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="w-full rounded-xl bg-ink/40 px-3 py-2.5 text-sm hairline" value={permission} onChange={(e) => setPermission(e.target.value as "view" | "download")}>
            <option value="view">Quyền: Xem</option>
            <option value="download">Quyền: Xem + Tải</option>
          </select>
          <Input placeholder="Hết hạn sau … ngày (trống = không)" value={days} onChange={(e) => setDays(e.target.value)} />
          <Input placeholder="Mã truy cập tuỳ chọn" value={code} onChange={(e) => setCode(e.target.value)} />
          <select className="w-full rounded-xl bg-ink/40 px-3 py-2.5 text-sm hairline" value={albumId} onChange={(e) => setAlbumId(e.target.value)}>
            <option value="">Chia sẻ {targets.length} mục đã chọn</option>
            {(albums.data?.items ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                Album: {a.name}
              </option>
            ))}
          </select>
          <Button className="w-full" onClick={() => void submit()}>
            Tạo chia sẻ
          </Button>
        </div>
      )}
    </Modal>
  );
}
