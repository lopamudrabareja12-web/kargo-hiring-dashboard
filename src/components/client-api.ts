"use client";

export async function api<T = { ok: true }>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("Network error: could not reach the server. Check your connection and press Retry.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json as { error?: string } | null)?.error;
    if (res.status === 504 || res.status === 502) throw new Error("The server timed out. Press Retry.");
    throw new Error(msg ?? `Request failed (HTTP ${res.status}). Press Retry.`);
  }
  return json as T;
}

export const postJson = <T,>(url: string, body?: unknown) =>
  api<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

export type Stage = "needs_name" | "extracted" | "scored_pm" | "scored" | "drafted";

export const STAGE_LABEL: Record<Stage, string> = {
  needs_name: "needs name",
  extracted: "scoring (PM)…",
  scored_pm: "scoring (SPM)…",
  scored: "drafting…",
  drafted: "done",
};

/** Run the remaining pipeline steps for one candidate, one request per step. */
export async function runSteps(id: string, onStage: (s: Stage) => void): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const r = await postJson<{ stage: Stage }>(`/api/candidates/${id}/step`);
    onStage(r.stage);
    if (r.stage === "drafted") return;
  }
  throw new Error("The pipeline did not finish. Press Retry.");
}

/** Redraft / generate briefs for anyone whose rank moved. */
export async function syncDrafts(onProgress: (remaining: number) => void): Promise<{ remaining: number; failed: number }> {
  let last = { remaining: 0, failed: 0 };
  for (let i = 0; i < 60; i++) {
    const r = await postJson<{ processed: number; remaining: number; failed: number }>("/api/drafts/sync");
    last = r;
    onProgress(r.remaining);
    if (r.remaining === 0 || r.processed === 0) break;
  }
  return last;
}
