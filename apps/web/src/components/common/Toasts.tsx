import { useToast } from "../../store/toast";
import { cn } from "./Ui";

export function Toasts() {
  const items = useToast((s) => s.items);
  const dismiss = useToast((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-[80] flex w-[min(92vw,360px)] flex-col gap-2 md:bottom-6">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            "pointer-events-auto rounded-xl px-4 py-3 text-left text-sm shadow-lift toast-in hairline",
            t.kind === "success" && "bg-ok/15 text-ok",
            t.kind === "error" && "bg-danger/15 text-danger",
            t.kind === "warn" && "bg-bronze/15 text-bronze",
            t.kind === "info" && "bg-elev text-paper",
          )}
        >
          <div className="font-medium">{t.title}</div>
          {t.body ? <div className="mt-0.5 text-xs opacity-80">{t.body}</div> : null}
        </button>
      ))}
    </div>
  );
}
