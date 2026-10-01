/** Single-password login. Works in the Edge middleware and in Node (Web Crypto only). */

export const SESSION_COOKIE = "kargo_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const enc = new TextEncoder();

/** Cookie value = HMAC(password, fixed label). Changing the password logs everyone out. */
export async function sessionToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("kargo-dashboard-session-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
