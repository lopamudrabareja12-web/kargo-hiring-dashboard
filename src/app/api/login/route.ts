import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSession, passwordMatches } from "@/lib/auth";
import { decideLogin, ipKey, recentFailures, recordFailure } from "@/lib/ratelimit";

export const runtime = "nodejs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const base = new URL(req.url);
  const to = (path: string) => NextResponse.redirect(new URL(path, base), 303);

  let password = "";
  let next = "/";
  try {
    const form = await req.formData();
    password = String(form.get("password") ?? "");
    next = String(form.get("next") ?? "/");
  } catch {
    return to("/login?error=1");
  }
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return to("/login?error=config");

  // Brute-force protection. If the lookup itself fails we still check the password (fail open),
  // because the dashboard is unusable without the database anyway.
  const key = ipKey(req, expected);
  let verdict = { locked: false, extraDelayMs: 0 };
  try {
    const f = await recentFailures(key);
    verdict = decideLogin(f.ip, f.total);
  } catch {
    console.error("[login] rate-limit lookup failed");
  }
  if (verdict.locked) {
    await sleep(500);
    return to("/login?error=locked");
  }
  if (verdict.extraDelayMs) await sleep(verdict.extraDelayMs);

  if (!(await passwordMatches(password, expected))) {
    await sleep(700); // makes each guess slow even before the lockout
    try {
      await recordFailure(key);
    } catch {
      console.error("[login] could not record a failed login");
    }
    return to("/login?error=1");
  }

  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const res = to(dest);
  res.cookies.set(SESSION_COOKIE, await createSession(expected), {
    httpOnly: true, secure: base.protocol === "https:", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE,
  });
  return res;
}
