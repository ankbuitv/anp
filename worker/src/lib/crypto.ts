const enc = new TextEncoder();

export function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of u8) s += b.toString(16).padStart(2, "0");
  return s;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 ? `0${hex}` : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function randomHex(n: number): string {
  return bytesToHex(randomBytes(n));
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const buf = typeof data === "string" ? enc.encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf as BufferSource);
  return bytesToHex(hash);
}

const PBKDF2_ITERS = 100_000;

export async function hashSecret(secret: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ? hexToBytes(saltHex) : randomBytes(16);
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    key,
    256,
  );
  return { hash: bytesToHex(bits), salt: bytesToHex(salt) };
}

export async function verifySecret(secret: string, hash: string, salt: string): Promise<boolean> {
  const next = await hashSecret(secret, salt);
  return timingSafeEqual(next.hash, hash);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomCode(len: number): string {
  const buf = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[(buf[i] ?? 0) % ALPHABET.length];
  return s;
}

export function shareDisplayCode(): string {
  return `${randomCode(4)}-${randomCode(4)}`;
}

export function dropCode(): string {
  return `ANP-DROP-${randomCode(4)}`;
}

export function newId(): string {
  return crypto.randomUUID();
}
