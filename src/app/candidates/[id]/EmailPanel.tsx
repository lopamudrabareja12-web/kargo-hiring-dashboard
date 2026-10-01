"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, postJson } from "@/components/client-api";
import type { EmailRow } from "@/lib/db";
import type { EmailKind } from "@/lib/ranking";

interface Preview {
  to: string;
  originalTo: string;
  overridden: boolean;
  from: string;
  subject: string;
  body: string;
  type: string;
  previewHash: string;
}

const KINDS: EmailKind[] = ["invite", "invite_plus_other", "invite_other_role", "rejection"];

export function EmailPanel({
  id, email, recommendedKind, kindLabels, appliedRole, ranked,
}: {
  id: string;
  email: EmailRow | null;
  recommendedKind: EmailKind | null;
  kindLabels: Record<EmailKind, string>;
  appliedRole: "PM" | "SPM";
  ranked: boolean;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(email?.subject ?? "");
  const [body, setBody] = useState(email?.body_template ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideKind, setOverrideKind] = useState<EmailKind>(email?.override_kind ?? recommendedKind ?? "rejection");
  const [reason, setReason] = useState("");

  const dirty = !!email && (subject !== email.subject || body !== email.body_template);

  const run = async (label: string, fn: () => Promise<void>) => {
    setErr(null);
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!email) {
    return (
      <div className="card">
        <h2>Email</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {ranked ? "No draft yet. Press Retry above (or \"Generate now\" on the dashboard)." : "The draft is written after scoring."}
        </p>
      </div>
    );
  }

  if (email.sent_at) {
    return (
      <div className="card border-green-300 bg-green-50">
        <h2>Email: Sent</h2>
        <p className="mt-1 text-xs text-neutral-700">
          Sent {new Date(email.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} to <b>{email.sent_to}</b>
          {" · "}{email.type}{email.edited ? " · edited by you" : ""} · Resend id {email.resend_id}
        </p>
        <p className="mt-3 text-sm font-medium">{email.final_subject}</p>
        <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{email.final_body}</pre>
        <p className="mt-2 text-xs text-neutral-500">Sent emails can&apos;t be sent again or edited.</p>
      </div>
    );
  }


  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2>Email draft</h2>
        <span className={`chip ${email.type === "invite" ? "bg-green-100 text-green-800" : "bg-neutral-100"}`}>{kindLabels[email.kind]}</span>
        {email.edited && <span className="chip bg-blue-100 text-blue-800">edited by you</span>}
        {email.override_kind && <span className="chip bg-purple-100 text-purple-800">your override</span>}
        {recommendedKind && <span className="text-xs text-neutral-500">System recommends: {kindLabels[recommendedKind]}</span>}
      </div>

      {email.outdated && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <b>Draft outdated.</b> Their position changed after you edited this draft: the system now recommends &ldquo;{recommendedKind && kindLabels[recommendedKind]}&rdquo;.
          Your edits were kept. Regenerate, override, or send as is.
        </div>
      )}
      {email.send_error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-900">Last send failed: {email.send_error}</p>}

      {preview ? (
        <div className="rounded border-2 border-neutral-900 p-3">
          <p className="text-sm font-semibold">Confirm this email. It goes out exactly as shown.</p>
          <dl className="mt-2 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
            <dt className="text-neutral-500">From</dt><dd>{preview.from}</dd>
            <dt className="text-neutral-500">To</dt>
            <dd><b>{preview.to}</b>{preview.overridden && <span className="ml-2 text-xs text-amber-800">(test override; real recipient {preview.originalTo})</span>}</dd>
            <dt className="text-neutral-500">Subject</dt><dd>{preview.subject}</dd>
          </dl>
          <pre className="mt-2 whitespace-pre-wrap rounded bg-neutral-50 p-3 font-sans text-sm">{preview.body}</pre>
          <div className="mt-3 flex gap-2">
            <button
              className="btn-primary"
              disabled={!!busy}
              onClick={() =>
                run("Sending…", async () => {
                  await postJson(`/api/candidates/${id}/email/send`, { previewHash: preview.previewHash });
                  setPreview(null);
                  router.refresh();
                })
              }
            >
              {busy ?? `Send this ${preview.type} now`}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => setPreview(null)}>Back to editing</button>
          </div>
        </div>
      ) : (
        <>
          <label className="block text-xs text-neutral-500">Subject
            <input className="input mt-0.5 text-neutral-900" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="block text-xs text-neutral-500">
            Body (<code>[NAME]</code> becomes their first name and <code>{"{{SCHEDULING_LINK}}"}</code> your booking link at send time)
            <textarea className="input mt-0.5 h-64 font-sans text-neutral-900" value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <p className="text-xs text-neutral-500">{body.trim().split(/\s+/).filter(Boolean).length} words{!body.includes("[NAME]") && " · no [NAME] placeholder"}</p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={!!busy}
              onClick={() =>
                run("Preparing preview…", async () => {
                  if (dirty) await postJson(`/api/candidates/${id}/email`, { subject, body });
                  setPreview(await api<Preview>(`/api/candidates/${id}/email/preview`));
                  if (dirty) router.refresh();
                })
              }
            >
              Confirm &amp; send…
            </button>
            <button
              className="btn"
              disabled={!!busy || !dirty}
              onClick={() => run("Saving…", async () => { await postJson(`/api/candidates/${id}/email`, { subject, body }); router.refresh(); })}
            >
              Save edits
            </button>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() =>
                run("Regenerating…", async () => {
                  await postJson(`/api/candidates/${id}/email/regenerate`);
                  router.refresh();
                  window.location.reload();
                })
              }
              title={email.edited ? "Replaces your edits with a new AI draft" : "Write a new AI draft"}
            >
              {email.edited || email.outdated ? "Regenerate (replaces your edits)" : "Regenerate"}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => setOverrideOpen((o) => !o)}>
              Change email type…
            </button>
            {busy && <span className="self-center text-sm text-neutral-600">{busy}</span>}
          </div>

          {overrideOpen && (
            <div className="rounded border border-purple-300 bg-purple-50 p-3 text-sm">
              <p className="font-medium">Override the recommendation</p>
              <p className="text-xs text-neutral-600">Your reason goes into the decision log. The draft is rewritten to match.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <select className="input max-w-xs bg-white" value={overrideKind} onChange={(e) => setOverrideKind(e.target.value as EmailKind)}>
                  {KINDS.map((k) => <option key={k} value={k}>{kindLabels[k]}{k === recommendedKind ? " (recommended)" : ""}</option>)}
                </select>
                <input className="input max-w-md bg-white" placeholder={`Why? e.g. "Strong ops background, worth a ${appliedRole} conversation"`} value={reason} onChange={(e) => setReason(e.target.value)} />
                <button
                  className="btn-primary"
                  disabled={!!busy}
                  onClick={() =>
                    run("Rewriting draft…", async () => {
                      await postJson(`/api/candidates/${id}/email/override`, { kind: overrideKind, reason });
                      window.location.reload();
                    })
                  }
                >
                  Apply
                </button>
                {email.override_kind && (
                  <button
                    className="btn"
                    disabled={!!busy}
                    onClick={() =>
                      run("Rewriting draft…", async () => {
                        await postJson(`/api/candidates/${id}/email/override`, { kind: null, reason: "back to recommendation" });
                        window.location.reload();
                      })
                    }
                  >
                    Clear override
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {err && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}
      <p className="text-xs text-neutral-500">One email per confirm. Nothing is ever sent automatically, in bulk or on a schedule.</p>
    </div>
  );
}
