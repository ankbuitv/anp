import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { HomeSummary } from "@anp/api-types";
import { formatBytes } from "@anp/shared";
import { api } from "../lib/api";
import { useUi } from "../store/ui";
import { Stat } from "../components/common/Ui";
import { uploads } from "../lib/upload";
import { useToast } from "../store/toast";

export function Home() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["home"], queryFn: () => api<HomeSummary>("/home") });
  const d = q.data;

  function pick() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,video/*";
    input.onchange = () => {
      const files = [...(input.files || [])];
      if (files.length) {
        uploads.enqueue(files);
        useToast.getState().push("info", `Đưa vào hàng đợi ${files.length} file`);
      }
    };
    input.click();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 anim-in">
      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-mute">Xin chào</div>
        <h1 className="mt-1 font-display text-4xl">Thư viện của bạn</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ảnh" value={d?.photoCount ?? "—"} />
        <Stat label="Video" value={d?.videoCount ?? "—"} />
        <Stat label="Dung lượng" value={d ? formatBytes(d.bytes) : "—"} />
        <Stat label="Album" value={d?.albumCount ?? "—"} />
      </div>
      <div>
        <h2 className="mb-3 text-sm uppercase tracking-[0.14em] text-mute">Thao tác nhanh</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            { l: "Tải ảnh/video", fn: pick },
            { l: "Tạo album", fn: () => nav("/albums") },
            { l: "Tạo chia sẻ", fn: () => nav("/shares") },
            { l: "ANP Drop", fn: () => nav("/drop") },
            { l: "Sao lưu", fn: () => nav("/backup") },
          ].map((a) => (
            <button key={a.l} onClick={a.fn} className="rounded-2xl bg-elev/70 px-4 py-4 text-left text-sm hairline hover:bg-line/10">
              {a.l}
            </button>
          ))}
        </div>
      </div>
      {d?.memories?.length ? (
        <section>
          <h2 className="mb-3 font-display text-2xl">Kỷ niệm</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {d.memories.map((m) => (
              <button key={m.year} onClick={() => nav("/memories")} className="overflow-hidden rounded-2xl bg-elev text-left hairline">
                {m.items[0] ? <img src={m.items[0].thumbUrl} className="h-36 w-full object-cover" alt="" /> : null}
                <div className="p-3">
                  <div className="font-medium">Hôm nay {m.yearsAgo} năm trước</div>
                  <div className="text-xs text-mute">{m.count} ảnh</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <Rail title="Upload gần đây" items={d?.recent ?? []} />
      <Rail title="Ảnh mới nhất" items={d?.latest ?? []} />
    </div>
  );
}

function Rail({ title, items }: { title: string; items: HomeSummary["recent"] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-3 font-display text-2xl">{title}</h2>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {items.map((m, i) => (
          <button
            key={m.id}
            className="h-28 w-28 shrink-0 overflow-hidden rounded-xl"
            onClick={() => useUi.getState().openViewer(items.map((x) => x.id), i)}
          >
            <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </section>
  );
}
