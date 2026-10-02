"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, postJson, runSteps, STAGE_LABEL, syncDrafts } from "@/components/client-api";

export function NameForm({ id, current, required }: { id: string; current: string; required: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="card-tint bg-sun-50"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          setBusy("saving…");
          const r = await postJson<{ stage: string }>(`/api/candidates/${id}/name`, { name });
          if (required && r.stage === "extracted") {
            await runSteps(id, (s) => setBusy(STAGE_LABEL[s]));
            await syncDrafts(() => {});
          }
          setBusy(null);
          router.refresh();
        } catch (e2) {
          setBusy(null);
          setErr((e2 as Error).message);
          router.refresh();
        }
      }}
    >
      <p className="font-semibold text-sun-800">{required ? "Name needed before scoring" : "Check the name"}</p>
      <p className="mt-1 text-xs leading-relaxed text-sun-800">
        {required
          ? "The name could not be found confidently. Type it so it can be removed from the CV text before any AI step. Nothing has been sent to AI."
          : "The name was guessed. If it is wrong, correct it (it will be removed from the stored CV text too)."}
      </p>
      <div className="mt-2 flex gap-2">
        <input aria-label="Full name" className="input max-w-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
        <button className="btn-primary" disabled={!!busy}>{busy ?? (required ? "Save and score" : "Save")}</button>
      </div>
      {err && <p role="alert" className="mt-2 text-xs text-clay-700">{err}</p>}
    </form>
  );
}

export function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!confirming) return <button className="btn-danger" onClick={() => setConfirming(true)}>Delete candidate</button>;
  return (
    <span className="inline-flex items-center gap-2 rounded border border-clay-100 bg-clay-50 px-2 py-1 text-xs text-clay-700">
      Delete every record for this person (CV text, contact details, scores, emails, history)? This can&apos;t be undone.
      <button
        className="btn-danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/candidates/${id}`, { method: "DELETE" });
            router.push("/");
            router.refresh();
          } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "Deleting…" : "Yes, delete"}
      </button>
      <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
      {err && <span className="text-clay-700">{err}</span>}
    </span>
  );
}
