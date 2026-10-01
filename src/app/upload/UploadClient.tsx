"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { STAGE_LABEL, api, runSteps, syncDrafts, type Stage } from "@/components/client-api";

type Role = "PM" | "SPM";
type Status = "queued" | "extracting" | "scoring (PM)…" | "scoring (SPM)…" | "drafting…" | "done" | "duplicate" | "needs name" | "error";

interface Item {
  key: string;
  file: File;
  role: Role;
  status: Status;
  id?: string;
  error?: string;
}

const CONCURRENCY = 2;

export function UploadClient() {
  const [role, setRole] = useState<Role | "">("");
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [sync, setSync] = useState<string | null>(null);
  const queue = useRef<Item[]>([]);
  const active = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const runSync = useCallback(async () => {
    try {
      setSync("Updating briefs and drafts for anyone whose rank moved…");
      const r = await syncDrafts((n) => setSync(n ? `Updating briefs and drafts: ${n} left…` : null));
      setSync(r.failed ? `${r.failed} draft(s) failed. Open the dashboard to retry them.` : null);
    } catch (e) {
      setSync(`Draft update stopped: ${(e as Error).message} You can resume it from the dashboard.`);
    }
  }, []);

  const process = useCallback(async (it: Item) => {
    try {
      let id = it.id;
      if (!id) {
        update(it.key, { status: "extracting", error: undefined });
        const fd = new FormData();
        fd.append("file", it.file);
        fd.append("role", it.role);
        const r = await api<{ kind: "created" | "duplicate"; id: string; stage?: Stage; needsName?: boolean }>("/api/process", { method: "POST", body: fd });
        id = r.id;
        update(it.key, { id });
        if (r.kind === "duplicate") return update(it.key, { status: "duplicate" });
        if (r.needsName) return update(it.key, { status: "needs name" });
      } else {
        update(it.key, { error: undefined });
      }
      await runSteps(id, (s) => update(it.key, { status: STAGE_LABEL[s] as Status }));
      update(it.key, { status: "done" });
    } catch (e) {
      update(it.key, { status: "error", error: (e as Error).message });
    }
  }, []);

  const pump = useCallback(() => {
    while (active.current < CONCURRENCY && queue.current.length) {
      const next = queue.current.shift()!;
      active.current++;
      process(next).finally(() => {
        active.current--;
        if (!queue.current.length && active.current === 0) runSync();
        else pump();
      });
    }
  }, [process, runSync]);

  const add = (files: FileList | File[]) => {
    if (!role) return;
    const accepted = [...files].filter((f) => /\.(pdf|docx)$/i.test(f.name));
    const rejected = [...files].filter((f) => !/\.(pdf|docx)$/i.test(f.name));
    const newItems: Item[] = accepted.map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, role, status: "queued" }));
    const bad: Item[] = rejected.map((file) => ({ key: `${file.name}-${Math.random()}`, file, role, status: "error", error: "Only PDF and DOCX files are supported." }));
    setItems((prev) => [...prev, ...newItems, ...bad]);
    queue.current.push(...newItems);
    pump();
  };

  const retry = (it: Item) => {
    queue.current.push(it);
    update(it.key, { status: "queued", error: undefined });
    pump();
  };

  const counts = items.reduce<Record<string, number>>((m, it) => ((m[it.status] = (m[it.status] ?? 0) + 1), m), {});

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">They applied for:</label>
        {(["PM", "SPM"] as Role[]).map((r) => (
          <label key={r} className={`btn ${role === r ? "border-neutral-900 bg-neutral-100 font-semibold" : ""}`}>
            <input type="radio" name="role" className="sr-only" checked={role === r} onChange={() => setRole(r)} />
            {r === "PM" ? "Product Manager (PM)" : "Senior Product Manager (SPM)"}
          </label>
        ))}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        onClick={() => role && inputRef.current?.click()}
        className={`flex h-36 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed text-sm ${
          !role ? "cursor-not-allowed border-neutral-200 text-neutral-400" : drag ? "border-neutral-900 bg-neutral-50" : "border-neutral-300 text-neutral-600"
        }`}
      >
        {role ? (
          <>
            <p>Drop PDF / DOCX files here, or click to choose.</p>
            <p className="mt-1 text-xs">They will be recorded as <b>{role}</b> applicants. Processed 2 at a time.</p>
          </>
        ) : (
          <p>Pick the role first.</p>
        )}
        <input ref={inputRef} type="file" multiple accept=".pdf,.docx" className="hidden" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      </div>

      {sync && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{sync}</p>}

      {items.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-neutral-600">
            {Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" · ")}
            {" · "}<Link href="/" className="underline">Open dashboard</Link>
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr><th className="py-1">File</th><th>Role</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.key} className="border-t border-neutral-100 align-top">
                  <td className="py-1.5 pr-3">{it.file.name}</td>
                  <td className="pr-3">{it.role}</td>
                  <td className="pr-3">
                    <span className={`chip ${
                      it.status === "done" ? "bg-green-100 text-green-800"
                      : it.status === "error" ? "bg-red-100 text-red-800"
                      : it.status === "needs name" ? "bg-amber-100 text-amber-900"
                      : it.status === "duplicate" ? "bg-neutral-100 text-neutral-600"
                      : "bg-blue-50 text-blue-800"}`}>
                      {it.status === "duplicate" ? "skipped (already uploaded)" : it.status}
                    </span>
                    {it.error && <p className="mt-1 text-xs text-red-700">{it.error}</p>}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {it.status === "error" && /\.(pdf|docx)$/i.test(it.file.name) && <button className="btn" onClick={() => retry(it)}>Retry</button>}
                    {it.status === "needs name" && it.id && <Link className="btn" href={`/candidates/${it.id}`}>Enter name</Link>}
                    {(it.status === "done" || it.status === "duplicate") && it.id && <Link className="text-xs underline" href={`/candidates/${it.id}`}>Open</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
