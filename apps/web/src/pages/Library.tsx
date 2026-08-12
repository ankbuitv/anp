import { useState } from "react";
import { Gallery } from "../components/media/Gallery";

export function Library() {
  return (
    <>
      <PageHead title="Thư viện" />
      <Gallery queryKey={["library"]} query={{}} emptyTitle="Thư viện của bạn đang trống." emptyBody="Kéo thả ảnh hoặc video vào đây, hoặc nhấn Tải lên." />
    </>
  );
}

export function Videos() {
  return (
    <>
      <PageHead title="Video" />
      <Gallery queryKey={["videos"]} query={{ type: "video" }} emptyTitle="Chưa có video." />
    </>
  );
}

export function Favorites() {
  return (
    <>
      <PageHead title="Yêu thích" />
      <Gallery queryKey={["fav"]} query={{ favorite: "1" }} emptyTitle="Chưa có ảnh yêu thích." />
    </>
  );
}

export function Recent() {
  return (
    <>
      <PageHead title="Ảnh mới" />
      <RecentInner />
    </>
  );
}

function RecentInner() {
  const [d, setD] = useState("7");
  return (
    <>
      <div className="flex gap-2 px-4 pt-2">
        {[
          ["1", "Hôm nay"],
          ["7", "7 ngày"],
          ["30", "30 ngày"],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setD(v!)} className={`rounded-full px-3 py-1 text-xs ${d === v ? "bg-bronze text-ink" : "bg-elev text-mute"}`}>
            {l}
          </button>
        ))}
      </div>
      <Gallery queryKey={["recent", d]} query={{ recent: d }} emptyTitle="Chưa có ảnh mới trong khoảng này." />
    </>
  );
}

export function PageHead({ title, extra }: { title: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between px-4 pt-6 md:px-6">
      <h1 className="font-display text-3xl">{title}</h1>
      {extra}
    </div>
  );
}
