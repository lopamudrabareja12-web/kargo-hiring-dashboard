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

  const STATUS_STYLE: Record<Status, string> = {
    queued: "bg-sand text-muted",
    extracting: "bg-plum-50 text-plum-700",
    "scoring (PM)…": "bg-plum-50 text-plum-700",
    "scoring (SPM)…": "bg-plum-50 text-plum-700",
    "drafting…": "bg-plum-50 text-plum-700",
    done: "bg-leaf-100 text-leaf-800",
    duplicate: "bg-sand text-muted",
    "needs name": "bg-sun-100 text-sun-800",
    error: "bg-clay-100 text-clay-700",
  };
  const busy = (s: Status) => s === "extracting" || s.endsWith("…");

  return (
    <div className="space-y-5">
      <div className="card space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold">1. Which role did they apply for?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["PM", "SPM"] as Role[]).map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition ${
                  role === r ? "border-leaf-500 bg-leaf-50" : "border-line hover:border-leaf-200"
                }`}
              >
                <input type="radio" name="role" className="sr-only" checked={role === r} onChange={() => setRole(r)} />
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${role === r ? "border-leaf-600 bg-leaf-600" : "border-line"}`}>
                  {role === r && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
                <span>
                  <span className="block font-semibold">{r === "PM" ? "Product Manager" : "Senior Product Manager"}</span>
                  <span className="block text-xs text-muted">{r === "PM" ? "PM applicants" : "SPM applicants: higher bar on independence"}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">2. Add the CVs</p>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
            onClick={() => role && inputRef.current?.click()}
            className={`flex h-48 flex-col items-center justify-center rounded-3xl border-2 border-dashed text-center transition ${
              !role ? "cursor-not-allowed border-line bg-cream text-muted"
              : drag ? "cursor-pointer border-leaf-500 bg-leaf-50 text-leaf-800"
              : "cursor-pointer border-leaf-200 bg-leaf-50/40 text-ink hover:bg-leaf-50"
            }`}
          >
            <span className="text-4xl" aria-hidden>{role ? "📄" : "👆"}</span>
            {role ? (
              <>
                <p className="mt-2 font-semibold">Drop PDF or Word files here</p>
                <p className="text-sm text-muted">or <span className="font-semibold text-leaf-700 underline">browse your computer</span></p>
                <p className="mt-2 text-xs text-muted">They&apos;ll be saved as <b>{role}</b> applicants · processed 2 at a time</p>
              </>
            ) : (
              <p className="mt-2 font-medium">Pick the role first</p>
            )}
            <input ref={inputRef} type="file" multiple accept=".pdf,.docx" className="hidden" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
          </div>
        </div>
      </div>

      {sync && <p className="rounded-3xl bg-sun-50 px-5 py-3 text-sm text-sun-800">✍️ {sync}</p>}

      {items.length > 0 && (
        <div className="card p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line/70 px-5 py-3 text-xs text-muted">
            {Object.entries(counts).map(([k, v]) => (
              <span key={k} className={`chip ${STATUS_STYLE[k as Status] ?? "bg-sand"}`}>{v} {k}</span>
            ))}
            <Link href="/" className="ml-auto font-semibold text-leaf-700">Open shortlist →</Link>
          </div>
          <ul>
            {items.map((it) => (
              <li key={it.key} className="flex flex-wrap items-center gap-3 border-t border-line/50 px-5 py-3 first:border-t-0">
                <span className="text-xl" aria-hidden>{it.status === "done" ? "✅" : it.status === "error" ? "⚠️" : it.status === "needs name" ? "✏️" : "📄"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.file.name}</p>
                  {it.error && <p className="text-xs text-clay-700">{it.error}</p>}
                </div>
                <span className="chip bg-sand text-muted">{it.role}</span>
                <span className={`chip ${STATUS_STYLE[it.status]}`}>
                  {busy(it.status) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
                  {it.status === "duplicate" ? "already uploaded" : it.status}
                </span>
                {it.status === "error" && /\.(pdf|docx)$/i.test(it.file.name) && <button className="btn py-1" onClick={() => retry(it)}>Retry</button>}
                {it.status === "needs name" && it.id && <Link className="btn py-1 no-underline" href={`/candidates/${it.id}`}>Enter name</Link>}
                {(it.status === "done" || it.status === "duplicate") && it.id && <Link className="text-xs font-semibold text-leaf-700" href={`/candidates/${it.id}`}>Open</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
