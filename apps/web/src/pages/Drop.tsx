import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DropSession } from "@anp/api-types";
import { api } from "../lib/api";
import { PageHead } from "./Library";
import { Button, Input } from "../components/common/Ui";
import { useToast } from "../store/toast";

export function Drop() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const q = useQuery({ queryKey: ["drops"], queryFn: () => api<{ items: DropSession[] }>("/drop") });
  const [active, setActive] = useState<{ id: string; code: string } | null>(null);
  const [qr, setQr] = useState("");
  const [join, setJoin] = useState("");

  useEffect(() => {
    if (active) QRCode.toDataURL(`${location.origin}/drop?c=${active.code}`, { width: 260, margin: 1 }).then(setQr);
  }, [active]);

  async function create(type: "send" | "receive") {
    const r = await api<{ id: string; code: string }>("/drop", { method: "POST", body: JSON.stringify({ type }) });
    setActive(r);
    qc.invalidateQueries({ queryKey: ["drops"] });
  }

  async function sendFiles(files: FileList | null) {
    if (!files || !active) return;
    for (const f of [...files]) {
      await fetch(`/api/v1/drop/${active.id}/files`, {
        method: "POST",
        credentials: "include",
        headers: { "x-filename": encodeURIComponent(f.name), "Content-Type": f.type || "application/octet-stream" },
        body: f,
      });
    }
    toast("success", "Đã gửi file qua ANP Drop");
    qc.invalidateQueries({ queryKey: ["drops"] });
  }

  return (
    <>
      <PageHead title="ANP Drop" extra={<span className="text-xs text-mute">Nền tảng gửi/nhận nhanh — Desktop/Mobile sẽ mở rộng LAN.</span>} />
      <div className="grid gap-4 p-4 md:grid-cols-2 md:p-6">
        <div className="rounded-2xl bg-elev p-5 hairline">
          <h2 className="font-display text-xl">Tạo phiên</h2>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void create("send")}>Tạo phiên gửi</Button>
            <Button variant="line" onClick={() => void create("receive")}>
              Tạo phiên nhận
            </Button>
          </div>
          {active ? (
            <div className="mt-5 text-center">
              <div className="font-mono text-2xl tracking-[0.15em]">{active.code}</div>
              {qr ? <img src={qr} alt="QR" className="mx-auto mt-3 w-40 rounded-xl" /> : null}
              <input type="file" multiple className="mt-4 w-full text-sm" onChange={(e) => void sendFiles(e.target.files)} />
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl bg-elev p-5 hairline">
          <h2 className="font-display text-xl">Tham gia phiên</h2>
          <div className="mt-3 flex gap-2">
            <Input placeholder="ANP-DROP-XXXX" value={join} onChange={(e) => setJoin(e.target.value.toUpperCase())} />
            <Button
              onClick={async () => {
                const r = await api<{ id: string; code: string }>(`/drop/code/${join}`);
                setActive({ id: r.id, code: r.code });
              }}
            >
              Vào
            </Button>
          </div>
        </div>
      </div>
      <div className="space-y-2 px-4 pb-10 md:px-6">
        {(q.data?.items ?? []).map((s) => (
          <div key={s.id} className="rounded-xl bg-elev/70 px-4 py-3 text-sm hairline">
            <span className="font-mono">{s.code}</span> · {s.type} · {s.status} · {s.files.length} file
          </div>
        ))}
      </div>
    </>
  );
}
