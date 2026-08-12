import { create } from "zustand";

export type ToastKind = "success" | "warn" | "error" | "info";
export type Toast = { id: string; kind: ToastKind; title: string; body?: string };

type S = {
  items: Toast[];
  push: (kind: ToastKind, title: string, body?: string) => void;
  dismiss: (id: string) => void;
};

export const useToast = create<S>((set) => ({
  items: [],
  push: (kind, title, body) => {
    const id = crypto.randomUUID();
    set((s) => ({ items: [...s.items.slice(-4), { id, kind, title, body }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), 4200);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));
