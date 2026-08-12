export type Env = {
  DB: D1Database;
  MEDIA: KVNamespace;
  ASSETS?: Fetcher;
  APP_URL?: string;
  ENVIRONMENT?: string;
  TURNSTILE_SECRET?: string;
};

export type AuthedUser = {
  id: string;
  name: string;
  email: string;
  avatarKey: string | null;
  hasVaultPin: boolean;
  createdAt: number;
};

export type AppContext = {
  Bindings: Env;
  Variables: {
    user: AuthedUser | null;
    sessionId: string | null;
    deviceId: string | null;
    vaultUnlocked: boolean;
    requestId: string;
  };
};
