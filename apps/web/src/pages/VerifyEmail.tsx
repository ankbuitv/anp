import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../store/auth";
import { Button } from "../components/common/Ui";
import { AuthFrame } from "./Login";
import type { UserPublic } from "@anp/api-types";

export function VerifyEmail() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [msg, setMsg] = useState("Đang xác nhận email…");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMsg("Thiếu liên kết xác nhận email.");
      return;
    }
    void (async () => {
      try {
        const res = await api<{ verified: boolean; user: UserPublic | null }>("/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (res.user) useAuth.setState({ user: res.user });
        await useAuth.getState().load();
        setStatus("success");
        setMsg("Email đã được xác nhận. Đang chuyển vào thư viện…");
        setTimeout(() => nav("/", { replace: true }), 900);
      } catch (e) {
        setStatus("error");
        setMsg(e instanceof ApiError ? e.message : "Không xác nhận được email.");
      }
    })();
  }, [token, nav]);

  return (
    <AuthFrame title="Xác nhận email" sub="ANP sẽ mở khóa thư viện sau khi email được xác nhận.">
      <div className="space-y-4">
        <p className={status === "error" ? "text-sm text-danger" : "text-sm text-mute"}>{msg}</p>
        {status === "success" ? <Button className="w-full" onClick={() => nav("/")}>Vào thư viện</Button> : null}
        {status === "error" ? (
          <div className="space-y-3">
            <Button className="w-full" onClick={() => nav("/login")}>Đăng nhập</Button>
            <p className="text-center text-sm text-mute">
              <Link to="/register" className="text-bronze">Tạo tài khoản khác</Link>
            </p>
          </div>
        ) : null}
      </div>
    </AuthFrame>
  );
}
