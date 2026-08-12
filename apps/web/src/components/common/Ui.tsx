import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function Button({
  variant = "solid",
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "line" | "danger" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:opacity-45 disabled:pointer-events-none";
  const styles = {
    solid: "bg-bronze text-ink hover:brightness-110",
    ghost: "hover:bg-line/10 text-paper",
    line: "hairline bg-elev/60 hover:bg-line/10",
    danger: "bg-danger/15 text-danger hover:bg-danger/25",
  };
  return <button className={cn(base, styles[variant], className)} {...p} />;
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-[0.14em] text-mute">{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cn(
        "w-full rounded-xl bg-ink/40 px-3 py-2.5 text-sm outline-none hairline placeholder:text-mute/70 focus:ring-2 focus:ring-bronze/40",
        p.className,
      )}
    />
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center anim-in">
      <div className="mb-5 h-16 w-16 rounded-2xl hairline bg-elev/70" />
      <h2 className="font-display text-2xl">{title}</h2>
      {body ? <p className="mt-2 text-sm text-mute">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center" role="dialog">
      <button className="absolute inset-0 bg-black/55" onClick={onClose} aria-label="Đóng" />
      <div className={cn("relative w-full glass hairline rounded-2xl p-5 shadow-lift anim-in", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-mute hover:text-paper">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-elev/70 p-4 hairline">
      <div className="text-xs uppercase tracking-[0.14em] text-mute">{label}</div>
      <div className="mt-1 font-display text-3xl">{value}</div>
      {hint ? <div className="mt-1 text-xs text-mute">{hint}</div> : null}
    </div>
  );
}
