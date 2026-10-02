"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, postJson } from "@/components/client-api";
import { Icon } from "@/components/Icons";
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
  // Anything that rewrites the draft asks first when Arjun has edited it.
  const [replaceAsk, setReplaceAsk] = useState<null | "regenerate" | "override" | "clear">(null);

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

  const edited = !!email?.edited;
  const doRegenerate = (replace: boolean) =>
    run("Regenerating…", async () => {
      await postJson(`/api/candidates/${id}/email/regenerate`, { replaceEdits: replace });
      window.location.reload();
    });
  const doOverride = (kind: EmailKind | null, why: string, replace: boolean) =>
    run("Rewriting draft…", async () => {
      await postJson(`/api/candidates/${id}/email/override`, { kind, reason: why, replaceEdits: replace });
      window.location.reload();
    });
  const askOr = (what: "regenerate" | "override" | "clear", go: (replace: boolean) => void) => {
    if (edited && replaceAsk !== what) return setReplaceAsk(what);
    setReplaceAsk(null);
    go(edited);
  };
  const confirmReplace = () => {
    if (replaceAsk === "regenerate") doRegenerate(true);
    else if (replaceAsk === "override") doOverride(overrideKind, reason, true);
    else if (replaceAsk === "clear") doOverride(null, "back to recommendation", true);
    setReplaceAsk(null);
  };

  if (!email) {
    return (
      <div className="card">
        <h2>Email</h2>
        <p className="mt-1 text-sm text-muted">
          {ranked ? "No draft yet. Press Retry above (or \"Generate now\" on the dashboard)." : "The draft is written after scoring."}
        </p>
      </div>
    );
  }

  if (email.sent_at) {
    return (
      <div className="card-tint reveal">
        <h2>Email: Sent</h2>
        <p className="mt-1 text-xs text-muted">
          Sent {new Date(email.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} to <b>{email.sent_to}</b>
          {" · "}{email.type}{email.edited ? " · edited by you" : ""} · Resend id {email.resend_id}
        </p>
        <p className="mt-3 text-sm font-medium">{email.final_subject}</p>
        <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{email.final_body}</pre>
        <p className="mt-2 text-xs text-muted">Sent emails can&apos;t be sent again or edited.</p>
      </div>
    );
  }


  return (
    <section className="card reveal space-y-4" style={{ "--i": 7 } as React.CSSProperties} aria-label="Email draft">
      <div className="flex flex-wrap items-center gap-2">
        <h2>Email draft</h2>
        <span className={`chip ${email.type === "invite" ? "bg-leaf-100 text-leaf-800" : "bg-sand"}`}>{kindLabels[email.kind]}</span>
        {email.edited && <span className="chip bg-bark-50 text-bark-700">edited by you</span>}
        {email.override_kind && <span className="chip bg-bark-50 text-bark-700">your override</span>}
        {recommendedKind && <span className="text-xs text-muted">System recommends: {kindLabels[recommendedKind]}</span>}
      </div>

      {email.outdated && (
        <div className="rounded-2xl border border-clay-100 bg-clay-50 px-3 py-2 text-sm text-clay-700">
          <b>Draft outdated.</b> Their position changed after you edited this draft: the system now recommends &ldquo;{recommendedKind && kindLabels[recommendedKind]}&rdquo;.
          Your edits were kept. Regenerate, override, or send as is.
        </div>
      )}
      {email.send_error && <p className="rounded-2xl bg-clay-50 px-3 py-2 text-sm text-clay-700">Last send failed: {email.send_error}</p>}

      {preview ? (
        <div className="rounded-2xl bg-cream p-5 shadow-[0_0_0_2px_var(--color-leaf-500)]">
          <p className="text-sm font-semibold">Confirm this email. It goes out exactly as shown.</p>
          <dl className="mt-2 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
            <dt className="text-muted">From</dt><dd>{preview.from}</dd>
            <dt className="text-muted">To</dt>
            <dd><b>{preview.to}</b>{preview.overridden && <span className="ml-2 text-xs text-sun-800">(test override; real recipient {preview.originalTo})</span>}</dd>
            <dt className="text-muted">Subject</dt><dd>{preview.subject}</dd>
          </dl>
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-paper p-5 font-sans text-sm leading-relaxed">{preview.body}</pre>
          <div className="mt-3 flex gap-2">
            <button
              className="btn-cta"
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
              <span className="btn-dot"><Icon name="send" size={15} /></span>
            </button>
            <button className="btn" disabled={!!busy} onClick={() => setPreview(null)}>Back to editing</button>
          </div>
        </div>
      ) : (
        <>
          <label className="block text-xs text-muted">Subject
            <input className="input mt-0.5 text-ink" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="block text-xs text-muted">
            Body (<code>[NAME]</code> becomes their first name and <code>{"{{SCHEDULING_LINK}}"}</code> your booking link at send time)
            <textarea className="input mt-0.5 h-64 font-sans text-ink" value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <p className="text-xs text-muted">{body.trim().split(/\s+/).filter(Boolean).length} words{!body.includes("[NAME]") && " · no [NAME] placeholder"}</p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-cta"
              disabled={!!busy}
              onClick={() =>
                run("Preparing preview…", async () => {
                  if (dirty) await postJson(`/api/candidates/${id}/email`, { subject, body });
                  setPreview(await api<Preview>(`/api/candidates/${id}/email/preview`));
                  if (dirty) router.refresh();
                })
              }
            >
              Confirm &amp; send
              <span className="btn-dot"><Icon name="arrowUpRight" size={16} /></span>
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
              onClick={() => askOr("regenerate", doRegenerate)}
              title={email.edited ? "Replaces your edits with a new AI draft" : "Write a new AI draft"}
            >
              {email.edited || email.outdated ? "Regenerate (replaces your edits)" : "Regenerate"}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => setOverrideOpen((o) => !o)}>
              Change email type…
            </button>
            {busy && <span className="self-center text-sm text-muted">{busy}</span>}
          </div>

          {replaceAsk && (
            <div role="alertdialog" aria-label="Replace your edits?" className="rounded-2xl bg-sun-50 p-4 text-sm text-sun-800">
              <p className="font-semibold">This replaces the edits you made to the draft.</p>
              <p className="mt-1 text-xs">The AI writes a fresh draft and your wording is lost. This can&apos;t be undone.</p>
              <div className="mt-3 flex gap-2">
                <button className="btn-primary" disabled={!!busy} onClick={confirmReplace}>Yes, replace my edits</button>
                <button className="btn" onClick={() => setReplaceAsk(null)}>Keep my edits</button>
              </div>
            </div>
          )}

          {overrideOpen && (
            <div className="rounded-2xl border border-bark-100 bg-bark-50 p-3 text-sm">
              <p className="font-medium">Override the recommendation</p>
              <p className="text-xs text-muted">Your reason goes into the decision log. The draft is rewritten to match.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <select className="input max-w-xs bg-white" value={overrideKind} onChange={(e) => setOverrideKind(e.target.value as EmailKind)}>
                  {KINDS.map((k) => <option key={k} value={k}>{kindLabels[k]}{k === recommendedKind ? " (recommended)" : ""}</option>)}
                </select>
                <input className="input max-w-md bg-white" placeholder={`Why? e.g. "Strong ops background, worth a ${appliedRole} conversation"`} value={reason} onChange={(e) => setReason(e.target.value)} />
                <button
                  className="btn-primary"
                  disabled={!!busy}
                  onClick={() => {
                    if (reason.trim().length < 5) return setErr("Write a short reason for the override (it goes in the decision log).");
                    setErr(null);
                    askOr("override", (replace) => doOverride(overrideKind, reason, replace));
                  }}
                >
                  Apply
                </button>
                {email.override_kind && (
                  <button className="btn" disabled={!!busy} onClick={() => askOr("clear", (replace) => doOverride(null, "back to recommendation", replace))}>
                    Clear override
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {err && <p className="rounded-2xl bg-clay-50 px-3 py-2 text-sm text-clay-700">{err}</p>}
      <p className="text-xs text-muted">One email per confirm. Nothing is ever sent automatically, in bulk or on a schedule.</p>
    </section>
  );
}
