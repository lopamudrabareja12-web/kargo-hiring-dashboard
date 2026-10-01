"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { MIN_SCORE, SHORTLIST_SIZE } from "@/lib/constants";
import type { DashboardRow } from "@/lib/queries";

type Filter = "all" | "above" | "below" | "unsent" | "sent";
const FILTERS: [Filter, string][] = [
  ["all", "All"], ["above", "Above the line"], ["below", "Below the line"], ["unsent", "Not yet sent"], ["sent", "Sent"],
];

export function MiniBar({ criteria }: { criteria: DashboardRow["criteria"] }) {
  return (
    <div className="flex h-3 w-36 overflow-hidden rounded-sm border border-neutral-200" aria-label="Per-criterion scores">
      {criteria.map((c) => (
        <div
          key={c.name}
          title={`${c.name}: ${c.score}/${c.max} (weight ${c.weight}%)`}
          style={{ width: `${c.weight}%` }}
          className={`border-r border-white last:border-r-0 ${c.score >= c.max ? "bg-green-600" : c.score > 0 ? "bg-amber-400" : "bg-neutral-200"}`}
        />
      ))}
    </div>
  );
}

export function BandChip({ band }: { band: DashboardRow["band"] }) {
  if (band === "above") return <span className="chip bg-green-100 text-green-800">Above the line</span>;
  if (band === "top5_below_bar") return <span className="chip bg-amber-100 text-amber-900">Top 5, below bar</span>;
  return <span className="chip bg-neutral-100 text-neutral-600">Below the line</span>;
}

function EmailChip({ r }: { r: DashboardRow }) {
  const color =
    r.emailStatus === "Sent" ? "bg-green-100 text-green-800"
    : r.emailStatus === "Outdated" || r.emailStatus === "Send failed" ? "bg-red-100 text-red-800"
    : r.emailStatus === "Edited" ? "bg-blue-100 text-blue-800"
    : r.emailStatus === "None" ? "bg-neutral-100 text-neutral-500"
    : "bg-neutral-100 text-neutral-800";
  return (
    <span className={`chip ${color}`}>
      {r.emailStatus === "Outdated" ? "Draft outdated" : r.emailStatus}
      {r.emailType && r.emailStatus !== "None" ? ` · ${r.emailType}` : ""}
    </span>
  );
}

export function DashboardTable({ rows, role }: { rows: DashboardRow[]; role: "PM" | "SPM" }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState(0);

  const shown = useMemo(
    () =>
      rows.filter((r) =>
        filter === "above" ? r.band === "above"
        : filter === "below" ? r.band !== "above"
        : filter === "sent" ? r.emailStatus === "Sent"
        : filter === "unsent" ? r.emailStatus !== "Sent"
        : true,
      ),
    [rows, filter],
  );

  useEffect(() => setSel(0), [filter, role]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "j") setSel((s) => Math.min(s + 1, shown.length - 1));
      else if (e.key === "k") setSel((s) => Math.max(s - 1, 0));
      else if (e.key === "Enter" && shown[sel]) router.push(`/candidates/${shown[sel].id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, sel, router]);

  useEffect(() => {
    document.getElementById(`row-${sel}`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const lastAbove = shown.map((r) => r.band).lastIndexOf("above");
  const lastTop5 = shown.map((r) => r.inTop5).lastIndexOf(true);
  const other = role === "PM" ? "SPM" : "PM";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {FILTERS.map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded px-2.5 py-1 text-xs ${filter === f ? "bg-neutral-900 text-white" : "border border-neutral-300"}`}>
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-neutral-500">Keys: <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>Enter</kbd> open</span>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-300 text-left text-xs text-neutral-500">
          <tr>
            <th className="py-1.5 pr-2">Rank</th>
            <th className="pr-2">Name</th>
            <th className="pr-2">Headline</th>
            <th className="pr-2 text-right">{role} total</th>
            <th className="pr-2">Criteria</th>
            <th className="pr-2">Line</th>
            <th className="pr-2">Cross-role</th>
            <th className="pr-2">Email</th>
          </tr>
        </thead>
        <tbody>
          {filter === "all" && lastAbove === -1 && (
            <tr><td colSpan={8} className="border-b-2 border-neutral-900 py-0.5 text-center text-xs font-semibold tracking-wide">THE LINE · nobody is in the top {SHORTLIST_SIZE} with ≥ {MIN_SCORE} yet</td></tr>
          )}
          {shown.map((r, i) => (
            <Fragment key={r.id}>
              <tr
                id={`row-${i}`}
                onClick={() => router.push(`/candidates/${r.id}`)}
                onMouseEnter={() => setSel(i)}
                className={`cursor-pointer border-b border-neutral-100 align-top ${i === sel ? "bg-blue-50" : r.band === "above" ? "" : "text-neutral-700"}`}
              >
                <td className="py-1.5 pr-2 font-mono">
                  {r.rank}{r.tiedCount > 0 ? "=" : ""}
                </td>
                <td className="pr-2">
                  <Link href={`/candidates/${r.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>
                  {!r.reviewed && <span className="chip ml-1 bg-blue-100 text-blue-800">new</span>}
                  {r.hasBrief && <span className="chip ml-1 bg-neutral-100" title="Interview brief ready">brief</span>}
                  {r.tiebreakNote && <p className="mt-0.5 max-w-xs text-xs text-neutral-500">{r.tiebreakNote}</p>}
                </td>
                <td className="max-w-xs pr-2 text-xs text-neutral-600">{r.headline ?? "–"}</td>
                <td className="pr-2 text-right">
                  <b>{r.total}</b>
                  <span className="block text-xs text-neutral-500">{other} {r.otherTotal ?? "–"}</span>
                </td>
                <td className="pr-2 pt-2"><MiniBar criteria={r.criteria} /></td>
                <td className="pr-2"><BandChip band={r.band} /></td>
                <td className="pr-2">
                  {r.crossRoleFit ? <span className="chip bg-purple-100 text-purple-800">fits {other} top 5</span> : <span className="text-neutral-300">–</span>}
                </td>
                <td className="pr-2"><EmailChip r={r} /></td>
              </tr>
              {filter === "all" && i === lastAbove && (
                <tr><td colSpan={8} className="border-b-2 border-neutral-900 py-0.5 text-center text-xs font-semibold tracking-wide">THE LINE · top {SHORTLIST_SIZE} and ≥ {MIN_SCORE}</td></tr>
              )}
              {filter === "all" && i === lastTop5 && lastTop5 !== lastAbove && (
                <tr><td colSpan={8} className="border-b border-dashed border-amber-500 py-0.5 text-center text-xs text-amber-800">end of top {SHORTLIST_SIZE} (rows between the lines are top {SHORTLIST_SIZE} but under the {MIN_SCORE} bar)</td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-neutral-500">
        Bar segments are sized by weight: <span className="inline-block h-2 w-3 bg-green-600" /> strong · <span className="inline-block h-2 w-3 bg-amber-400" /> partial · <span className="inline-block h-2 w-3 bg-neutral-200" /> weak/none. Hover for each criterion.
      </p>
    </div>
  );
}
