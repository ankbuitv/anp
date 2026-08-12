import { useEffect, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../store/auth";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { TopBar } from "./TopBar";
import { Viewer } from "../media/Viewer";
import { SelectionBar } from "../media/SelectionBar";
import { ContextMenu } from "../media/ContextMenu";
import { UploadDock } from "../upload/UploadDock";
import { ShareModal } from "../share/ShareModal";
import { AlbumPicker } from "../album/AlbumPicker";
import { Toasts } from "../common/Toasts";
import { uploads } from "../../lib/upload";
import { useToast } from "../../store/toast";

export function AppShell() {
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const on = (e: DragEvent) => {
      e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length) {
        const r = uploads.enqueue(files);
        useToast.getState().push("info", `Đưa vào hàng đợi ${r.accepted} file`);
      }
    };
    el.addEventListener("dragover", on);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", on);
      el.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <div ref={dropRef} className="flex h-dvh overflow-hidden bg-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="relative min-h-0 flex-1 overflow-y-auto pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <Viewer />
      <SelectionBar />
      <ContextMenu />
      <UploadDock />
      <ShareModal />
      <AlbumPicker />
      <Toasts />
      <button
        className="fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-bronze text-ink shadow-lift md:hidden"
        onClick={() => {
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
        }}
        title="Tải lên"
      >
        +
      </button>
    </div>
  );
}

export function RequireAuth() {
  const { ready, user } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (ready && !user) nav("/login", { replace: true });
  }, [ready, user, nav]);
  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center bg-ink text-mute">
        Đang mở ANP…
      </div>
    );
  }
  if (!user) return null;
  return <AppShell />;
}
