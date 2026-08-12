import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../store/auth";
import { PageHead } from "./Library";
import { Gallery } from "../components/media/Gallery";
import { Button, Input } from "../components/common/Ui";

export function Private() {
  const { user, vaultUnlocked, load } = useAuth();
  const [pin, setPin] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState("");

  async function unlock() {
    setErr("");
    try {
      await api("/auth/vault/unlock", { method: "POST", body: JSON.stringify({ pin }) });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "PIN không đúng.");
    }
  }
  async function setup() {
    setErr("");
    try {
      await api("/auth/vault/pin", { method: "POST", body: JSON.stringify({ pin: next }) });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không thể đặt PIN.");
    }
  }

  if (!user?.hasVaultPin) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="font-display text-3xl">Private Vault</h1>
        <p className="mt-2 text-sm text-mute">Đặt PIN 6 số. Media trong Vault không xuất hiện ở thư viện thường và share công khai.</p>
        <Input className="mt-6 text-center tracking-[0.5em]" maxLength={6} value={next} onChange={(e) => setNext(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
        <Button className="mt-4 w-full" onClick={() => void setup()} disabled={next.length !== 6}>
          Tạo PIN
        </Button>
      </div>
    );
  }

  if (!vaultUnlocked) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="font-display text-3xl">Private Vault</h1>
        <p className="mt-2 text-sm text-mute">Nhập PIN</p>
        <Input className="mt-6 text-center tracking-[0.6em] text-xl" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        <div className="mt-3 flex justify-center gap-2 text-bronze">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="h-2 w-2 rounded-full bg-bronze/30" style={{ opacity: i < pin.length ? 1 : 0.25 }} />
          ))}
        </div>
        {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
        <Button className="mt-6 w-full" onClick={() => void unlock()} disabled={pin.length !== 6}>
          Mở
        </Button>
      </div>
    );
  }

  return (
    <>
      <PageHead
        title="Private Vault"
        extra={
          <Button
            variant="line"
            onClick={async () => {
              await api("/auth/vault/lock", { method: "POST" });
              await load();
            }}
          >
            Khóa
          </Button>
        }
      />
      <Gallery queryKey={["vault"]} query={{ private: "1" }} emptyTitle="Kho riêng tư đang trống." />
    </>
  );
}
