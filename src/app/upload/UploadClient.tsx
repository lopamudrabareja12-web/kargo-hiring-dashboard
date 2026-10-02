"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/Icons";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
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
  /** For a duplicate: the role it was already filed under. */
  existingRole?: Role;
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
        const r = await api<{ kind: "created" | "duplicate"; id: string; role?: Role; stage?: Stage; needsName?: boolean }>("/api/process", { method: "POST", body: fd });
        id = r.id;
        update(it.key, { id });
        if (r.kind === "duplicate") return update(it.key, { status: "duplicate", existingRole: r.role });
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
    const isDoc = (f: File) => /\.(pdf|docx)$/i.test(f.name);
    const accepted = [...files].filter((f) => isDoc(f) && f.size <= MAX_UPLOAD_BYTES);
    const rejected = [...files].filter((f) => !isDoc(f) || f.size > MAX_UPLOAD_BYTES);
    const newItems: Item[] = accepted.map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, role, status: "queued" }));
    const bad: Item[] = rejected.map((file) => ({ key: `${file.name}-${Math.random()}`, file, role, status: "error", error: isDoc(file) ? `This file is ${(file.size / 1048576).toFixed(1)} MB. Files over ${MAX_UPLOAD_BYTES / 1048576} MB can't be uploaded here: save a smaller PDF and try again.` : "Only PDF and DOCX files are supported." }));
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
    extracting: "bg-bark-100 text-bark-700",
    "scoring (PM)…": "bg-bark-100 text-bark-700",
    "scoring (SPM)…": "bg-bark-100 text-bark-700",
    "drafting…": "bg-bark-100 text-bark-700",
    done: "bg-leaf-100 text-leaf-800",
    duplicate: "bg-sand text-muted",
    "needs name": "bg-sun-100 text-sun-800",
    error: "bg-clay-100 text-clay-700",
  };
  const busy = (s: Status) => s === "extracting" || s.endsWith("…");

  return (
    <div className="space-y-6">
      <div className="card reveal space-y-8 p-7 sm:p-8" style={{ "--i": 1 } as React.CSSProperties}>
        <fieldset>
          <legend className="mb-3 flex items-center gap-2.5 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-white">1</span>
            Which role did they apply for?
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["PM", "SPM"] as Role[]).map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center gap-3.5 rounded-2xl p-4 transition duration-500 ease-spring active:scale-[0.99] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-leaf-600 ${
                  role === r ? "bg-leaf-50 shadow-[0_0_0_2px_var(--color-leaf-500)]" : "bg-cream shadow-[0_0_0_1px_rgb(120_95_55/0.14)] hover:bg-leaf-50/60"
                }`}
              >
                <input type="radio" name="role" className="sr-only" checked={role === r} onChange={() => setRole(r)} />
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition duration-500 ease-spring ${role === r ? "bg-leaf-700" : "shadow-[inset_0_0_0_1.5px_rgb(120_95_55/0.35)]"}`}>
                  {role === r && <Icon name="check" size={13} className="text-white" />}
                </span>
                <span>
                  <span className="block font-semibold">{r === "PM" ? "Product Manager" : "Senior Product Manager"}</span>
                  <span className="block text-xs text-muted">{r === "PM" ? "PM applicants" : "SPM applicants: higher bar on independence"}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <p className="mb-3 flex items-center gap-2.5 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-white">2</span>
            Add the CVs
          </p>
          <button
            type="button"
            disabled={!role}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
            onClick={() => role && inputRef.current?.click()}
            className={`flex min-h-52 w-full flex-col items-center justify-center rounded-[1.6rem] px-6 text-center transition duration-500 ease-spring disabled:cursor-not-allowed ${
              !role ? "bg-cream text-muted shadow-[inset_0_0_0_2px_rgb(120_95_55/0.12)]"
              : drag ? "scale-[1.01] bg-leaf-100 text-leaf-800 shadow-[inset_0_0_0_2px_var(--color-leaf-500)]"
              : "bg-leaf-50/60 text-ink shadow-[inset_0_0_0_2px_var(--color-leaf-200)] hover:bg-leaf-50"
            }`}
          >
            <span className={`flex h-14 w-14 items-center justify-center rounded-[1.1rem] transition duration-500 ease-spring ${role ? "bg-leaf-700 text-white" : "bg-sand text-muted"}`}>
              <Icon name={role ? "upload" : "file"} size={26} />
            </span>
            {role ? (
              <>
                <span className="mt-4 font-semibold">Drop PDF or Word files here</span>
                <span className="mt-1 text-sm text-muted">or <span className="font-semibold text-leaf-700 underline underline-offset-4">browse your computer</span></span>
                <span className="mt-3 text-xs text-muted">Saved as <b>{role}</b> applicants · processed two at a time</span>
              </>
            ) : (
              <span className="mt-4 font-medium">Pick the role first</span>
            )}
          </button>
          <input ref={inputRef} type="file" multiple accept=".pdf,.docx" className="sr-only" tabIndex={-1} aria-label="Choose CV files" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
        </div>
      </div>

      {sync && <p role="status" className="flex items-center gap-2.5 rounded-2xl bg-sun-50 px-5 py-3.5 text-sm text-sun-800"><Icon name="pen" size={18} />{sync}</p>}

      {items.length > 0 && (
        <section className="card card-flush reveal" aria-label="Upload progress">
          <div className="flex flex-wrap items-center gap-2 border-b border-line/60 px-6 py-4 text-xs">
            {Object.entries(counts).map(([k, v]) => (
              <span key={k} className={`chip ${STATUS_STYLE[k as Status] ?? "bg-sand"}`}>{v} {k}</span>
            ))}
            <Link href="/" className="ml-auto inline-flex items-center gap-1.5 font-semibold text-leaf-700">Open the shortlist <Icon name="arrowUpRight" size={14} /></Link>
          </div>
          <ul>
            {items.map((it) => (
              <li key={it.key} className="flex flex-wrap items-center gap-3 border-t border-line/50 px-6 py-3.5 first:border-t-0">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${it.status === "done" ? "bg-leaf-100 text-leaf-700" : it.status === "error" ? "bg-clay-100 text-clay-700" : it.status === "needs name" ? "bg-sun-100 text-sun-800" : "bg-sand text-muted"}`}>
                  <Icon name={it.status === "done" ? "check" : it.status === "error" ? "warning" : it.status === "needs name" ? "pencil" : "file"} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.file.name}</p>
                  {it.error && <p className="text-xs text-clay-700">{it.error}</p>}
                  {it.status === "duplicate" && it.existingRole && it.existingRole !== it.role && (
                    <p className="text-xs text-muted">Skipped: this CV is already filed as {it.existingRole}. To change it, open the candidate and press &ldquo;Move to {it.role}&rdquo;.</p>
                  )}
                </div>
                <span className="chip bg-sand text-muted">{it.role}</span>
                <span className={`chip ${STATUS_STYLE[it.status]}`}>
                  {busy(it.status) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
                  {it.status === "duplicate" ? `already uploaded${it.existingRole ? ` as ${it.existingRole}` : ""}` : it.status}
                </span>
                {it.status === "error" && /\.(pdf|docx)$/i.test(it.file.name) && it.file.size <= MAX_UPLOAD_BYTES && <button className="btn" onClick={() => retry(it)}>Retry</button>}
                {it.status === "needs name" && it.id && <Link className="btn no-underline" href={`/candidates/${it.id}`}>Enter name</Link>}
                {(it.status === "done" || it.status === "duplicate") && it.id && <Link className="text-xs font-semibold text-leaf-700" href={`/candidates/${it.id}`}>Open</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
