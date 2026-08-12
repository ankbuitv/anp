import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { PublicShare } from "@anp/api-types";
import { api, ApiError } from "../lib/api";
import { useUi } from "../store/ui";
import { Button, Input } from "../components/common/Ui";

export function ShareView() {
  const { token } = useParams();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const q = useQuery({
    queryKey: ["public-share", token],
    enabled: !!token,
    queryFn: () => api<PublicShare & { token?: string }>(`/shares/public/${token}`),
    retry: false,
  });

  if (q.isError) {
    const e = q.error as ApiError;
    return (
      <Shell>
        <h1 className="font-display text-3xl">{e.code === "gone" ? "Chia sẻ đã hết hạn." : "Bạn không có quyền truy cập."}</h1>
      </Shell>
    );
  }
  if (!q.data) {
    return (
      <Shell>
        <p className="text-mute">Đang mở…</p>
      </Shell>
    );
  }
  const d = q.data;
  if (d.requiresCode && !d.unlocked) {
    return (
      <Shell>
        <h1 className="font-display text-3xl">Nhập mã truy cập</h1>
        <Input className="mt-6 text-center tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value)} />
        {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
        <Button
          className="mt-4 w-full"
          onClick={async () => {
            try {
              await api(`/shares/public/${token}/unlock`, { method: "POST", body: JSON.stringify({ code }) });
              await q.refetch();
            } catch (e) {
              setErr(e instanceof ApiError ? e.message : "Mã truy cập không hợp lệ.");
            }
          }}
        >
          Xem
        </Button>
      </Shell>
    );
  }

  return (
    <div className="min-h-dvh bg-ink">
      <header className="mx-auto flex max-w-5xl items-end justify-between px-4 py-10">
        <div>
          <div className="font-display text-bronze">ANP</div>
          <h1 className="mt-2 font-display text-4xl">{d.title}</h1>
          <p className="mt-2 text-mute">
            {d.photoCount} ảnh · {d.videoCount} video
          </p>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-1 px-4 pb-16 sm:grid-cols-4">
        {d.items.map((m, i) => (
          <button key={m.id} className="aspect-square overflow-hidden rounded-lg" onClick={() => useUi.getState().openViewer(d.items.map((x) => x.id), i)}>
            <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink px-4">
      <div className="w-full max-w-md rounded-3xl bg-elev p-8 text-center hairline">
        <div className="mb-4 font-display text-3xl text-bronze">ANP</div>
        {children}
      </div>
    </div>
  );
}
