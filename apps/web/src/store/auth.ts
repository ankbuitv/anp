import { create } from "zustand";
import type { UserPublic, UserSettings } from "@anp/api-types";
import { api } from "../lib/api";

type S = {
  ready: boolean;
  user: UserPublic | null;
  settings: UserSettings | null;
  vaultUnlocked: boolean;
  load: () => Promise<void>;
  setUser: (u: UserPublic | null) => void;
  setVault: (v: boolean) => void;
};

export const useAuth = create<S>((set) => ({
  ready: false,
  user: null,
  settings: null,
  vaultUnlocked: false,
  setUser: (user) => set({ user }),
  setVault: (vaultUnlocked) => set({ vaultUnlocked }),
  load: async () => {
    try {
      const data = await api<{ user: UserPublic; settings: UserSettings; vaultUnlocked: boolean }>("/auth/me");
      set({ user: data.user, settings: data.settings, vaultUnlocked: data.vaultUnlocked, ready: true });
    } catch {
      set({ user: null, ready: true, vaultUnlocked: false });
    }
  },
}));
