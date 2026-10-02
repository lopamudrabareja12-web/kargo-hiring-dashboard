/**
 * Login brute-force protection. Failed attempts are recorded in the `events` table (no candidate,
 * and only a salted hash of the IP, never the address itself), so the count survives across
 * serverless instances.
 */
import { createHash } from "node:crypto";
import { db } from "./db";

export const LOGIN_WINDOW_MS = 15 * 60_000;
export const LOGIN_MAX_PER_IP = 8; // then this address is locked out until the window passes
export const LOGIN_SLOW_AFTER_TOTAL = 40; // across everyone: slow every attempt down instead of locking out

export type LoginVerdict = { locked: boolean; extraDelayMs: number };

export function decideLogin(ipFailures: number, totalFailures: number): LoginVerdict {
  return {
    locked: ipFailures >= LOGIN_MAX_PER_IP,
    extraDelayMs: totalFailures >= LOGIN_SLOW_AFTER_TOTAL ? 2_500 : 0,
  };
}

export function ipKey(req: Request, salt: string): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}

export async function recentFailures(key: string): Promise<{ ip: number; total: number }> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const [ip, total] = await Promise.all([
    db().from("events").select("id", { count: "exact", head: true }).eq("action", "login_failed").gte("at", since).contains("detail", { ip: key }),
    db().from("events").select("id", { count: "exact", head: true }).eq("action", "login_failed").gte("at", since),
  ]);
  if (ip.error || total.error) throw new Error("rate-limit lookup failed");
  return { ip: ip.count ?? 0, total: total.count ?? 0 };
}

export async function recordFailure(key: string): Promise<void> {
  const r = await db().from("events").insert({ candidate_id: null, action: "login_failed", detail: { ip: key } });
  if (r.error) throw new Error("could not record the failed login");
}
