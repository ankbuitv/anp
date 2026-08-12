export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS?: Fetcher;
  APP_URL?: string;
  ENVIRONMENT?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
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
