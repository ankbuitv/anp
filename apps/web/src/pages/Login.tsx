import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../store/auth";
import { Button, Field, Input } from "../components/common/Ui";
import type { UserPublic } from "@anp/api-types";

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await api<{ user: UserPublic }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, deviceType: "web", deviceName: "Trình duyệt web" }),
      });
      useAuth.setState({ user: res.user });
      await useAuth.getState().load();
      const latest = useAuth.getState().user ?? res.user;
      nav(latest.emailVerified ? "/" : "/verify-email/pending");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không thể đăng nhập.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Đăng nhập" sub="Ảnh và video của bạn, ở một nơi.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Mật khẩu">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        <Button className="w-full" disabled={busy}>
          {busy ? "Đang vào…" : "Đăng nhập"}
        </Button>
        <p className="text-center text-sm text-mute">
          Chưa có tài khoản?{" "}
          <Link to="/register" className="text-bronze">
            Đăng ký
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}

export function AuthFrame({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-ink px-4">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "radial-gradient(900px 400px at 20% 10%, rgba(215,163,106,.18), transparent), radial-gradient(700px 400px at 90% 80%, rgba(125,186,154,.08), transparent)" }} />
      <div className="relative w-full max-w-md rounded-3xl bg-elev/70 p-8 shadow-lift hairline">
        <div className="mb-6">
          <div className="font-display text-4xl text-bronze">ANP</div>
          <h1 className="mt-3 font-display text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-mute">{sub}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
