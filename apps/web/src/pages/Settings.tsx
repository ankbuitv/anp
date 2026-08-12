import { useState } from "react";
import { Link } from "react-router-dom";
import { KEYBOARD_SHORTCUTS } from "@anp/shared";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { PageHead } from "./Library";
import { Button, Field, Input } from "../components/common/Ui";
import { useToast } from "../store/toast";
import JSZip from "jszip";
import { isZipBomb, safeZipEntryName } from "@anp/shared";
import { uploads } from "../lib/upload";

export function Settings() {
  const user = useAuth((s) => s.user);
  const settings = useAuth((s) => s.settings);
  const theme = useUi((s) => s.theme);
  const toast = useToast((s) => s.push);
  const [name, setName] = useState(user?.name || "");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  return (
    <>
      <PageHead title="Cài đặt" />
      <div className="mx-auto max-w-2xl space-y-8 p-4 md:p-6">
        <section className="rounded-2xl bg-elev p-5 hairline">
          <h2 className="font-display text-xl">Hồ sơ</h2>
          <Field label="Tên">
            <Input className="mt-2" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="mt-2 text-sm text-mute">{user?.email}</div>
          <Button
            className="mt-3"
            onClick={async () => {
              await api("/auth/me", { method: "PATCH", body: JSON.stringify({ name }) });
              await useAuth.getState().load();
              toast("success", "Đã lưu hồ sơ");
            }}
          >
            Lưu
          </Button>
        </section>

        <section className="rounded-2xl bg-elev p-5 hairline">
          <h2 className="font-display text-xl">Mật khẩu</h2>
          <div className="mt-3 space-y-2">
            <Input type="password" placeholder="Mật khẩu hiện tại" value={cur} onChange={(e) => setCur(e.target.value)} />
            <Input type="password" placeholder="Mật khẩu mới" value={pw} onChange={(e) => setPw(e.target.value)} />
            <Input type="password" placeholder="Xác nhận" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          <Button
            className="mt-3"
            onClick={async () => {
              await api("/auth/password", { method: "POST", body: JSON.stringify({ currentPassword: cur, password: pw, confirmPassword: pw2 }) });
              toast("success", "Đã đổi mật khẩu");
              setCur("");
              setPw("");
              setPw2("");
            }}
          >
            Đổi mật khẩu
          </Button>
        </section>

        <section className="rounded-2xl bg-elev p-5 hairline">
          <h2 className="font-display text-xl">Giao diện</h2>
          <div className="mt-3 flex gap-2">
            {(["dark", "light", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={async () => {
                  useUi.getState().setTheme(t);
                  await api("/auth/settings", { method: "PATCH", body: JSON.stringify({ theme: t }) });
                }}
                className={`rounded-xl px-3 py-2 text-sm ${theme === t ? "bg-bronze text-ink" : "bg-ink/30"}`}
              >
                {t === "dark" ? "Tối" : t === "light" ? "Sáng" : "Hệ thống"}
              </button>
            ))}
          </div>
          <div className="mt-4 text-sm text-mute">Thời gian trình chiếu: {settings?.slideshowSeconds ?? 5}s</div>
        </section>

        <section className="rounded-2xl bg-elev p-5 hairline">
          <h2 className="font-display text-xl">Nhập ZIP</h2>
          <p className="mt-1 text-sm text-mute">ANP kiểm tra path traversal và ZIP bomb, rồi đưa media vào hàng đợi tải lên.</p>
          <input
            type="file"
            accept=".zip"
            className="mt-3 text-sm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const zip = await JSZip.loadAsync(file);
                const files: File[] = [];
                let uncompressed = 0;
                const entries = Object.values(zip.files).filter((f) => !f.dir);
                for (const ent of entries) {
                  const name = safeZipEntryName(ent.name);
                  if (!name) continue;
                  const blob = await ent.async("blob");
                  uncompressed += blob.size;
                  files.push(new File([blob], name.split("/").pop() || name, { type: blob.type }));
                }
                const bomb = isZipBomb({ entries: entries.length, compressed: file.size, uncompressed });
                if (!bomb.ok) {
                  toast("error", bomb.reason);
                  return;
                }
                uploads.enqueue(files);
                toast("info", `Nhập ${files.length} file từ ZIP`);
              } catch {
                toast("error", "ZIP không hợp lệ.");
              }
            }}
          />
        </section>

        <section className="rounded-2xl bg-elev p-5 hairline">
          <h2 className="font-display text-xl">Xuất toàn bộ dữ liệu</h2>
          <p className="mt-1 text-sm text-mute">Tạo job xuất metadata. Album lớn: xuất ZIP từ trang album.</p>
          <Button
            className="mt-3"
            variant="line"
            onClick={async () => {
              await api("/jobs/export", { method: "POST", body: JSON.stringify({ scope: "all" }) });
              toast("success", "Đã xếp hàng xuất dữ liệu");
            }}
          >
            Xuất metadata
          </Button>
        </section>

        <section className="rounded-2xl bg-elev p-5 hairline">
          <h2 className="font-display text-xl">Phím tắt</h2>
          <div className="mt-3 divide-y divide-line/10">
            {KEYBOARD_SHORTCUTS.map((k) => (
              <div key={k.keys} className="flex justify-between py-2 text-sm">
                <span className="font-mono text-bronze">{k.keys}</span>
                <span className="text-mute">{k.action}</span>
              </div>
            ))}
          </div>
        </section>

        <Link to="/devices" className="block text-sm text-bronze">
          Quản lý thiết bị →
        </Link>
      </div>
    </>
  );
}
