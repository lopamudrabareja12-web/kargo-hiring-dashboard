import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, safeEqual, sessionToken } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const expected = process.env.DASHBOARD_PASSWORD;
  const base = new URL(req.url);
  if (!expected) {
    return NextResponse.redirect(new URL("/login?error=config", base), 303);
  }
  if (!safeEqual(await sessionToken(password), await sessionToken(expected))) {
    return NextResponse.redirect(new URL("/login?error=1", base), 303);
  }
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const res = NextResponse.redirect(new URL(dest, base), 303);
  res.cookies.set(SESSION_COOKIE, await sessionToken(expected), {
    httpOnly: true, secure: base.protocol === "https:", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE,
  });
  return res;
}
