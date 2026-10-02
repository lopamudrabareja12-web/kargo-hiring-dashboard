import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE, createSession, passwordMatches, verifySession } from "@/lib/auth";
import { LOGIN_MAX_PER_IP, LOGIN_SLOW_AFTER_TOTAL, decideLogin } from "@/lib/ratelimit";

describe("sessions", () => {
  const pw = "correct horse battery staple";
  it("a fresh session verifies", async () => {
    expect(await verifySession(await createSession(pw), pw)).toBe(true);
  });
  it("every login gets a different cookie", async () => {
    expect(await createSession(pw)).not.toBe(await createSession(pw));
  });
  it("is rejected with the wrong password, after changing the password, or when tampered with", async () => {
    const s = await createSession(pw);
    expect(await verifySession(s, "another password")).toBe(false);
    const [v, exp, nonce, sig] = s.split(".");
    expect(await verifySession(`${v}.${Number(exp) + 1000}.${nonce}.${sig}`, pw)).toBe(false); // extend expiry
    const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0"); // always a different last character
    expect(await verifySession(`${v}.${exp}.${nonce}.${flipped}`, pw)).toBe(false);
  });
  it("expires on the server side", async () => {
    const issued = Date.now();
    const s = await createSession(pw, issued);
    expect(await verifySession(s, pw, issued + (SESSION_MAX_AGE - 5) * 1000)).toBe(true);
    expect(await verifySession(s, pw, issued + (SESSION_MAX_AGE + 5) * 1000)).toBe(false);
  });
  it("rejects the old fixed-token format and junk", async () => {
    expect(await verifySession("3bc334cf43fa3dea73e7a8ea493a12c0a61cb5bb9c79d51ac482678403757f0c", pw)).toBe(false);
    expect(await verifySession("", pw)).toBe(false);
    expect(await verifySession("v2.9999999999999.abc.def", pw)).toBe(false);
  });
  it("password check is exact", async () => {
    expect(await passwordMatches(pw, pw)).toBe(true);
    expect(await passwordMatches(pw + " ", pw)).toBe(false);
    expect(await passwordMatches("", pw)).toBe(false);
  });
});

describe("login rate limit", () => {
  it("locks one address after too many failures, but never locks everyone", () => {
    expect(decideLogin(LOGIN_MAX_PER_IP - 1, 0).locked).toBe(false);
    expect(decideLogin(LOGIN_MAX_PER_IP, 0).locked).toBe(true);
    const flood = decideLogin(0, LOGIN_SLOW_AFTER_TOTAL + 100);
    expect(flood.locked).toBe(false);
    expect(flood.extraDelayMs).toBeGreaterThan(0);
  });
});
