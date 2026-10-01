"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson, runSteps, syncDrafts, STAGE_LABEL } from "./client-api";

export function RetryButton({ id, rescore = false, label }: { id: string; rescore?: boolean; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setErr(null);
    try {
      if (rescore) {
        setBusy("resetting…");
        await postJson(`/api/candidates/${id}/rescore`);
      }
      await runSteps(id, (s) => setBusy(STAGE_LABEL[s]));
      setBusy("updating others…");
      await syncDrafts(() => {});
      setBusy(null);
      router.refresh();
    } catch (e) {
      setBusy(null);
      setErr((e as Error).message);
      router.refresh();
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button className="btn" disabled={!!busy} onClick={go}>{busy ?? label ?? (rescore ? "Re-score" : "Retry")}</button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </span>
  );
}

export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="btn"
        disabled={!!busy}
        onClick={async () => {
          setErr(null);
          setBusy("working…");
          try {
            const r = await syncDrafts((n) => setBusy(`${n} left…`));
            if (r.failed) setErr(`${r.failed} failed. See "Needs attention".`);
          } catch (e) {
            setErr((e as Error).message);
          }
          setBusy(null);
          router.refresh();
        }}
      >
        {busy ?? "Generate now"}
      </button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </span>
  );
}
