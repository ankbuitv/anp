import { create } from "zustand";
import type { Media } from "@anp/api-types";

type Viewer = { ids: string[]; index: number; info: boolean; slideshow: boolean; interval: number } | null;

type S = {
  sidebarCollapsed: boolean;
  mobileNav: boolean;
  theme: "dark" | "light" | "system";
  viewer: Viewer;
  selectMode: boolean;
  selected: Set<string>;
  lastClicked: string | null;
  shareOpen: boolean;
  albumOpen: boolean;
  shareTargets: string[];
  albumTargets: string[];
  context: { x: number; y: number; media: Media } | null;
  toggleSidebar: () => void;
  setTheme: (t: S["theme"]) => void;
  openViewer: (ids: string[], index: number) => void;
  closeViewer: () => void;
  stepViewer: (dir: number) => void;
  toggleInfo: () => void;
  setSlideshow: (on: boolean, interval?: number) => void;
  toggleSelect: (id: string, range?: string[]) => void;
  setSelected: (ids: string[]) => void;
  clearSelect: () => void;
  openShare: (ids: string[]) => void;
  openAlbum: (ids: string[]) => void;
  setContext: (c: S["context"]) => void;
};

function applyTheme(t: S["theme"]) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = t === "dark" || (t === "system" && prefersDark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export const useUi = create<S>((set, get) => ({
  sidebarCollapsed: typeof window !== "undefined" ? window.innerWidth < 1100 : false,
  mobileNav: false,
  theme: "dark",
  viewer: null,
  selectMode: false,
  selected: new Set(),
  lastClicked: null,
  shareOpen: false,
  albumOpen: false,
  shareTargets: [],
  albumTargets: [],
  context: null,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTheme: (t) => {
    applyTheme(t);
    localStorage.setItem("anp-theme", t);
    set({ theme: t });
  },
  openViewer: (ids, index) => set({ viewer: { ids, index, info: true, slideshow: false, interval: 5 }, context: null }),
  closeViewer: () => set({ viewer: null }),
  stepViewer: (dir) =>
    set((s) => {
      if (!s.viewer) return s;
      const next = (s.viewer.index + dir + s.viewer.ids.length) % s.viewer.ids.length;
      return { viewer: { ...s.viewer, index: next } };
    }),
  toggleInfo: () => set((s) => (s.viewer ? { viewer: { ...s.viewer, info: !s.viewer.info } } : s)),
  setSlideshow: (on, interval) =>
    set((s) => (s.viewer ? { viewer: { ...s.viewer, slideshow: on, interval: interval ?? s.viewer.interval } } : s)),
  toggleSelect: (id, range) => {
    const selected = new Set(get().selected);
    if (range) {
      for (const x of range) selected.add(x);
    } else if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    set({ selected, selectMode: selected.size > 0, lastClicked: id });
  },
  setSelected: (ids) => set({ selected: new Set(ids), selectMode: ids.length > 0 }),
  clearSelect: () => set({ selected: new Set(), selectMode: false }),
  openShare: (ids) => set({ shareOpen: true, shareTargets: ids, context: null }),
  openAlbum: (ids) => set({ albumOpen: true, albumTargets: ids, context: null }),
  setContext: (context) => set({ context }),
}));

export function initTheme() {
  const saved = (localStorage.getItem("anp-theme") as S["theme"] | null) || "dark";
  useUi.getState().setTheme(saved);
}
