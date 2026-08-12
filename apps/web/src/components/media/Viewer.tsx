import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Media, MediaVersion } from "@anp/api-types";
import { api, apiBlob } from "../../lib/api";
import { formatBytes } from "@anp/shared";
import { formatDateTime } from "../../lib/format";
import { useUi } from "../../store/ui";
import { useToast } from "../../store/toast";
import { Icon } from "../common/Icons";
import { Button, cn } from "../common/Ui";

function Row({ k, v }: { k: string; v: string | number | null | undefined }) {
  return (
    <div className="grid grid-cols-[1fr_1.2fr] gap-2 border-b border-line/10 py-2 text-sm">
      <div className="text-mute">{k}</div>
      <div className="font-mono text-[12.5px]">{v == null || v === "" ? "Không có thông tin." : String(v)}</div>
    </div>
  );
}

export function Viewer() {
  const viewer = useUi((s) => s.viewer);
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [zoom, setZoom] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const id = viewer ? viewer.ids[viewer.index] : null;

  const shareToken = typeof window !== "undefined" && location.pathname.startsWith("/s/")
    ? location.pathname.split("/s/")[1]?.split("/")[0]
    : null;
  const q = useQuery({
    queryKey: ["media-one", id, shareToken],
    enabled: !!id,
    queryFn: () =>
      api<{ media: Media; versions: MediaVersion[] }>(`/media/${id}${shareToken ? `?share=${shareToken}` : ""}`),
  });
  const m = q.data?.media;

  useEffect(() => {
    setZoom(1);
  }, [id]);

  useEffect(() => {
    if (!viewer?.slideshow) return;
    const t = window.setInterval(() => useUi.getState().stepViewer(1), (viewer.interval || 5) * 1000);
    return () => window.clearInterval(t);
  }, [viewer?.slideshow, viewer?.interval, viewer?.index]);

  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") useUi.getState().closeViewer();
      if (e.key === "ArrowRight") useUi.getState().stepViewer(1);
      if (e.key === "ArrowLeft") useUi.getState().stepViewer(-1);
      if (e.key === "i" || e.key === "I") useUi.getState().toggleInfo();
      if (e.key === "f" || e.key === "F") document.documentElement.requestFullscreen?.();
      if (e.key === " " && m?.mediaType === "video") {
        e.preventDefault();
        const v = videoRef.current;
        if (v) {
          if (v.paused) void v.play();
          else v.pause();
        }
      }
      if (e.key === "d" || e.key === "D") void download();
      if ((e.key === "s" || e.key === "S") && m) useUi.getState().openShare([m.id]);
      if (e.key === "Delete" && m) void trash();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!viewer) return null;

  async function fav() {
    if (!m) return;
    await api(`/media/batch/favorite?value=${m.isFavorite ? "0" : "1"}`, {
      method: "POST",
      body: JSON.stringify({ ids: [m.id] }),
    });
    qc.invalidateQueries({ queryKey: ["media"] });
    qc.invalidateQueries({ queryKey: ["media-one", m.id] });
  }
  async function trash() {
    if (!m) return;
    await api("/media/batch/delete", { method: "POST", body: JSON.stringify({ ids: [m.id] }) });
    toast("success", "Đã chuyển vào thùng rác");
    qc.invalidateQueries({ queryKey: ["media"] });
    useUi.getState().closeViewer();
  }
  async function download() {
    if (!m) return;
    const blob = await apiBlob(`/media/${m.id}/file?dl=1`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = m.originalName;
    a.click();
  }

  const showInfo = viewer.info;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/92 md:flex-row">
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center gap-1 bg-gradient-to-b from-black/70 to-transparent p-3">
          <button className="rounded-lg p-2 text-white/80 hover:bg-white/10" onClick={() => useUi.getState().closeViewer()}>
            <Icon.Close />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm text-white/80">{m?.filename}</div>
          <button className="rounded-lg p-2 text-white/80 hover:bg-white/10" onClick={fav} title="Yêu thích">
            {m?.isFavorite ? <Icon.StarFill className="text-bronze" /> : <Icon.Star />}
          </button>
          <button className="rounded-lg p-2 text-white/80 hover:bg-white/10" onClick={download} title="Tải xuống">
            <Icon.Download />
          </button>
          <button className="rounded-lg p-2 text-white/80 hover:bg-white/10" onClick={() => m && useUi.getState().openShare([m.id])} title="Chia sẻ">
            <Icon.Link />
          </button>
          <button className="rounded-lg p-2 text-white/80 hover:bg-white/10" onClick={() => m && useUi.getState().openAlbum([m.id])} title="Album">
            <Icon.Album />
          </button>
          <button className="rounded-lg p-2 text-white/80 hover:bg-white/10" onClick={() => useUi.getState().toggleInfo()} title="Thông tin">
            <Icon.Info />
          </button>
          <button className="rounded-lg p-2 text-white/80 hover:bg-white/10" onClick={trash} title="Xóa">
            <Icon.Trash />
          </button>
        </div>
        <button className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white" onClick={() => useUi.getState().stepViewer(-1)}>
          ‹
        </button>
        <button className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white" onClick={() => useUi.getState().stepViewer(1)}>
          ›
        </button>
        {m?.mediaType === "video" ? (
          <video ref={videoRef} src={m.fileUrl} controls className="max-h-full max-w-full" />
        ) : m ? (
          <img
            src={m.previewUrl}
            alt={m.filename}
            className="max-h-full max-w-full select-none object-contain"
            style={{ transform: `scale(${zoom})`, transformOrigin: `${origin.x}% ${origin.y}%` }}
            onDoubleClick={() => setZoom((z) => (z === 1 ? 2.4 : 1))}
            onWheel={(e) => {
              e.preventDefault();
              setZoom((z) => Math.min(6, Math.max(1, z + (e.deltaY < 0 ? 0.2 : -0.2))));
            }}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setOrigin({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
          />
        ) : (
          <div className="text-white/50">Đang tải…</div>
        )}
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-full bg-black/45 px-2 py-1">
          <button className="px-2 text-xs text-white/80" onClick={() => useUi.getState().setSlideshow(!viewer.slideshow)}>
            {viewer.slideshow ? "Tạm dừng" : "Trình chiếu"}
          </button>
          {[3, 5, 10].map((n) => (
            <button key={n} className={cn("px-2 text-xs text-white/60", viewer.interval === n && "text-bronze")} onClick={() => useUi.getState().setSlideshow(true, n)}>
              {n}s
            </button>
          ))}
        </div>
      </div>

      <aside
        className={cn(
          "z-10 overflow-y-auto bg-elev text-paper md:h-full md:w-[340px] md:shrink-0",
          showInfo ? "max-h-[46vh] md:max-h-none" : "hidden md:hidden",
        )}
      >
        <div className="p-5">
          <h3 className="font-display text-xl">Thông tin</h3>
          {m ? (
            <div className="mt-3">
              <Row k="Tên file" v={m.originalName} />
              <Row k="Loại" v={m.mediaType === "video" ? "Video" : "Ảnh"} />
              <Row k="Dung lượng" v={formatBytes(m.size)} />
              <Row k="Resolution" v={m.width && m.height ? `${m.width} × ${m.height}` : null} />
              <Row k="Ngày chụp" v={m.takenAt ? formatDateTime(m.takenAt) : null} />
              <Row k="Ngày upload" v={formatDateTime(m.uploadedAt)} />
              <Row k="Người chụp" v={m.photographer} />
              <Row k="Camera" v={[m.cameraMake, m.cameraModel].filter(Boolean).join(" ") || null} />
              <Row k="Lens" v={m.lens} />
              <Row k="ISO" v={m.iso} />
              <Row k="Khẩu độ" v={m.aperture} />
              <Row k="Tốc độ màn trập" v={m.shutterSpeed} />
              <Row k="Tiêu cự" v={m.focalLength} />
              <Row k="Địa điểm" v={m.locationName} />
              <Row k="Latitude" v={m.lat} />
              <Row k="Longitude" v={m.lng} />
              <Row k="Checksum" v={m.checksum} />
              <Row k="Album" v={m.albums.map((a) => a.name).join(", ") || null} />
              {q.data?.versions?.length ? (
                <div className="mt-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-mute">Phiên bản</div>
                  {q.data.versions.map((v) => (
                    <div key={v.id} className="mt-1 text-xs text-mute">
                      v{v.version} {v.current ? "· hiện tại" : ""} · {formatDateTime(v.createdAt)}
                    </div>
                  ))}
                </div>
              ) : null}
              <Button className="mt-4 w-full md:hidden" variant="line" onClick={() => useUi.getState().toggleInfo()}>
                Đóng thông tin
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-mute">Không có thông tin.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
