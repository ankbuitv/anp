import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../store/auth";
import { Button } from "../components/common/Ui";
import { AuthFrame } from "./Login";

export function VerifyEmailPending() {
  const nav = useNavigate();
  const { ready, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (ready && !user) nav("/login", { replace: true });
    if (ready && user?.emailVerified) nav("/", { replace: true });
  }, [ready, user, nav]);

  async function enterLibrary() {
    setMsg("Đang vào thư viện…");
    await useAuth.getState().load();
    setTimeout(() => nav("/", { replace: true }), 400);
  }

  async function resend() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await api<{ queued: boolean; verified?: boolean }>("/auth/verify-email/resend", { method: "POST", body: "{}" });
      if (res.verified) {
        setMsg("Tài khoản đã được xác nhận. Đang vào thư viện…");
        await enterLibrary();
      } else {
        setMsg("Đã gửi lại email xác nhận. Kiểm tra hộp thư (và mục spam).");
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không gửi được email. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    setErr("");
    try {
      await api("/auth/verify-email/skip", { method: "POST", body: "{}" });
      await enterLibrary();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không vào được thư viện.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !user || user.emailVerified) return null;
  return (
    <AuthFrame title="Xác nhận email" sub="Một bước nữa để mở khóa thư viện ANP.">
      <div className="space-y-4">
        <p className="text-sm leading-6 text-mute">
          Chúng tôi đã gửi liên kết xác nhận tới <span className="text-cream">{user.email}</span>. Bấm vào liên kết trong email để kích hoạt tài khoản.
        </p>
        {msg ? <p className="rounded-xl bg-moss/10 px-3 py-2 text-sm text-moss">{msg}</p> : null}
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        <Button className="w-full" disabled={busy} onClick={resend}>
          {busy ? "Đang gửi…" : "Gửi lại email xác nhận"}
        </Button>
        <Button className="w-full" variant="line" disabled={busy} onClick={() => void skip()}>
          Vào thư viện ngay
        </Button>
        <p className="text-center text-sm text-mute">
          <Link to="/login" className="text-bronze">Đăng nhập tài khoản khác</Link>
        </p>
      </div>
    </AuthFrame>
  );
}
