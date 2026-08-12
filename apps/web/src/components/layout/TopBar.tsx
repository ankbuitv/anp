import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../store/ui";
import { Icon } from "../common/Icons";
import { uploads } from "../../lib/upload";
import { useToast } from "../../store/toast";

export function TopBar() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const unread = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ unread: number }>("/notifications"),
    refetchInterval: 30_000,
  });

  function pick() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,video/*";
    input.onchange = () => {
      const files = [...(input.files || [])];
      if (files.length) {
        const r = uploads.enqueue(files);
        useToast.getState().push("info", `Đưa vào hàng đợi ${r.accepted} file`);
      }
    };
    input.click();
  }

  return (
    <header className="flex items-center gap-2 border-b border-line/10 px-3 py-2.5 md:px-5">
      <button className="rounded-lg p-2 text-mute md:hidden" onClick={() => useUi.setState({ mobileNav: true })} aria-label="Menu">
        <Icon.Menu />
      </button>
      <form
        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-elev/70 px-3 py-2 hairline"
        onSubmit={(e) => {
          e.preventDefault();
          nav(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <Icon.Search size={16} className="shrink-0 text-mute" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm ảnh, địa điểm, máy ảnh…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-mute/70"
        />
      </form>
      <button onClick={pick} className="hidden items-center gap-2 rounded-xl bg-bronze px-3 py-2 text-sm font-medium text-ink sm:flex">
        <Icon.Upload size={16} /> Tải lên
      </button>
      <button onClick={() => nav("/notifications")} className="relative rounded-lg p-2 text-mute hover:text-paper" aria-label="Thông báo">
        <Icon.Bell />
        {(unread.data?.unread || 0) > 0 ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-bronze" />
        ) : null}
      </button>
    </header>
  );
}
