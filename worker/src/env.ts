export type Env = {
  DB: D1Database;
  MEDIA: KVNamespace;
  ASSETS?: Fetcher;
  APP_URL?: string;
  ENVIRONMENT?: string;
  TURNSTILE_SECRET?: string;
  MAIL_FROM?: string;
  RESEND_API_KEY?: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
  BREVO_API_KEY?: string;
  EMAIL_PROVIDER?: "resend" | "mailgun" | "brevo" | "log" | "none";
};

export type AuthedUser = {
  id: string;
  name: string;
  email: string;
  avatarKey: string | null;
  hasVaultPin: boolean;
  emailVerified: boolean;
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
