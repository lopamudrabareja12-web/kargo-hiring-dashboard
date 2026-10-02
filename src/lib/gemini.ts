import { GoogleGenAI, type Schema } from "@google/genai";
import { env } from "./env";
import { assertNoPii } from "./pii";

export class AiError extends Error {}

/** Thrown by a validator when the model's JSON is well-formed but breaks a rule. */
export class OutputInvalid extends Error {}

let ai: GoogleGenAI | null = null;
function client() {
  if (!ai) ai = new GoogleGenAI({ apiKey: env.geminiKey() });
  return ai;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: number; code?: number };
  return typeof e?.status === "number" ? e.status : typeof e?.code === "number" ? e.code : undefined;
}

function isTransient(err: unknown): boolean {
  const s = statusOf(err);
  if (s === 429 || (s !== undefined && s >= 500)) return true;
  const msg = String((err as Error)?.message ?? "");
  return /timed out|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg);
}

/** Readable message for the UI. Never includes prompt text. */
function describe(err: unknown): string {
  const s = statusOf(err);
  if (s === 429) return "Gemini rate limit reached (429). Wait a minute and press Retry.";
  if (s === 400) return "Gemini rejected the request (400). Check GEMINI_MODEL is a valid model name.";
  if (s === 401 || s === 403) return "Gemini refused the API key (401/403). Check GEMINI_API_KEY.";
  if (s !== undefined && s >= 500) return `Gemini had a server error (${s}). Press Retry.`;
  const msg = String((err as Error)?.message ?? err);
  if (/timed out/i.test(msg)) return "Gemini took too long to answer. Press Retry.";
  return `Gemini call failed: ${msg.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]").slice(0, 200)}`;
}

export interface JsonCall<T> {
  /** What this call is, for error messages ("PM scoring"). */
  label: string;
  system: string;
  prompt: string;
  schema: Schema;
  /** Parse + check the JSON. Throw OutputInvalid with a reason to trigger one corrective retry. */
  validate: (data: unknown) => T;
  /** The candidate's name, so the guardrail can check it is absent. */
  guardName: string | null;
  /** Fixed rubric text inside the prompt (may name past hires); skipped by the name check only. */
  trusted?: string[];
  /** Wall-clock budget for all attempts (route handlers have 60 s). */
  budgetMs?: number;
}

/**
 * One structured Gemini call with: the PII guardrail, temperature 0, a response schema,
 * backoff on 429/5xx/timeouts, and one corrective retry on invalid output.
 */
export async function generateJson<T>(call: JsonCall<T>): Promise<T> {
  // GUARDRAIL: nothing goes to Gemini if it contains an email, a phone number or the name.
  // The system prompt is fixed text we wrote ("Arjun Mehta, Founder, Kargo"): check it for contact
  // details, but not for a candidate's name, which can legitimately match a word in it.
  assertNoPii(call.system, null);
  assertNoPii(call.prompt, call.guardName, call.trusted);

  const deadline = Date.now() + (call.budgetMs ?? 50_000);
  let prompt = call.prompt;
  let invalidRetries = 0;
  let transientRetries = 0;

  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining < 5_000) throw new AiError(`${call.label}: ran out of time waiting for Gemini. Press Retry.`);
    const timeoutMs = Math.min(env.geminiTimeoutMs(), remaining - 1_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let text: string | undefined;
    try {
      const res = await client().models.generateContent({
        model: env.geminiModel(),
        contents: prompt,
        config: {
          systemInstruction: call.system,
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: call.schema,
          thinkingConfig: { thinkingBudget: env.geminiThinkingBudget() },
          abortSignal: controller.signal,
        },
      });
      text = res.text;
    } catch (err) {
      const e = controller.signal.aborted ? new Error("timed out") : err;
      if (isTransient(e) && transientRetries < 3) {
        // Google's 429 says how long to wait ("retryDelay":"23s"); otherwise back off 2s, 5s, 10s.
        const hinted = Number(String((e as Error)?.message ?? "").match(/retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/)?.[1]);
        const wait = Number.isFinite(hinted) && hinted > 0 ? hinted * 1000 + 500 : [2_000, 5_000, 10_000][transientRetries];
        if (deadline - Date.now() - wait > 8_000) {
          transientRetries++;
          await sleep(wait);
          continue;
        }
      }
      throw new AiError(`${call.label}: ${describe(e)}`);
    } finally {
      clearTimeout(timer);
    }

    try {
      if (!text) throw new OutputInvalid("the response was empty");
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new OutputInvalid("the response was not valid JSON");
      }
      return call.validate(data);
    } catch (err) {
      if (!(err instanceof OutputInvalid)) throw err;
      if (invalidRetries >= 1) {
        throw new AiError(`${call.label}: Gemini returned invalid output twice (${err.message}). Press Retry.`);
      }
      invalidRetries++;
      prompt =
        call.prompt +
        `\n\nIMPORTANT: your previous answer was rejected because ${err.message}. Answer again, following every rule.`;
    }
  }
}
