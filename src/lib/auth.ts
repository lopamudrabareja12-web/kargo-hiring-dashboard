/** Single-password login. Works in the Edge middleware and in Node (Web Crypto only). */

export const SESSION_COOKIE = "kargo_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const VERSION = "v2";

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Constant-time password check (both sides are hashed to the same length first). */
export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  // Fixed key, password as the message: a zero-length key (empty password) would throw.
  const [a, b] = await Promise.all([hmacHex("kargo-password-check", input), hmacHex("kargo-password-check", expected)]);
  return safeEqual(a, b);
}

/**
 * Session cookie = `v2.<expiry>.<random>.<signature>`. The expiry is signed, so the server
 * enforces it (a copied cookie stops working when it runs out), and every login gets its own
 * random part. Changing the password invalidates every session.
 */
export async function createSession(password: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_MAX_AGE;
  const nonce = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const body = `${VERSION}.${exp}.${nonce}`;
  return `${body}.${await hmacHex(password, body)}`;
}

export async function verifySession(value: string, password: string, now = Date.now()): Promise<boolean> {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return false;
  const [v, expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return false; // expired
  if (exp * 1000 - now > (SESSION_MAX_AGE + 60) * 1000) return false; // expiry further out than we ever issue
  return safeEqual(sig, await hmacHex(password, `${v}.${expStr}.${nonce}`));
}
