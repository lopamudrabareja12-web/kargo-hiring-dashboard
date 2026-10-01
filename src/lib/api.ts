import { NextResponse } from "next/server";
import { ConfigError } from "./env";
import { DbError } from "./db";
import { ExtractError } from "./extract";
import { AiError } from "./gemini";
import { EMAIL_RE, PiiLeakError, findPhones } from "./pii";
import { PipelineError } from "./pipeline";
import { RubricError } from "./rubric-parse";

const KNOWN = [ConfigError, DbError, ExtractError, AiError, PiiLeakError, PipelineError, RubricError];

/** Wrap a route: readable JSON errors for the UI, and logs that never contain PII. */
export async function handle(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true });
  } catch (err) {
    const known = KNOWN.some((K) => err instanceof K);
    const message = known ? (err as Error).message : "Unexpected server error. Press Retry; if it repeats, check the Vercel logs.";
    // Our own error messages never include CV text, names, emails or phones; scrub anyway.
    console.error(`[api] ${(err as Error)?.name ?? "Error"}: ${scrub(known ? message : String((err as Error)?.message ?? "").slice(0, 200))}`);
    return NextResponse.json({ error: message }, { status: known ? 400 : 500 });
  }
}

export function isRole(x: unknown): x is "PM" | "SPM" {
  return x === "PM" || x === "SPM";
}

function scrub(s: string): string {
  let out = s.replace(EMAIL_RE, "[email]");
  for (const p of findPhones(out)) out = out.split(p).join("[phone]");
  return out;
}
