import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../store/auth";
import { Button, Field, Input } from "../components/common/Ui";
import { AuthFrame } from "./Login";
import type { UserPublic } from "@anp/api-types";

export function Register() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await api<{ user: UserPublic }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });
      useAuth.setState({ user: res.user });
      await useAuth.getState().load();
      nav(res.user.emailVerified ? "/" : "/verify-email/pending");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không thể đăng ký.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Tạo tài khoản" sub="Thư viện riêng, media không công khai, không AI.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tên">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Mật khẩu">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label="Xác nhận mật khẩu">
          <Input type="password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        <Button className="w-full" disabled={busy}>
          {busy ? "Đang tạo…" : "Đăng ký"}
        </Button>
        <p className="text-center text-sm text-mute">
          Đã có tài khoản?{" "}
          <Link to="/login" className="text-bronze">
            Đăng nhập
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}
