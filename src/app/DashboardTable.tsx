"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Brand";
import { Icon } from "@/components/Icons";
import { MIN_SCORE, SHORTLIST_SIZE } from "@/lib/constants";
import type { DashboardRow } from "@/lib/queries";

type Filter = "all" | "above" | "below" | "unsent" | "sent";
const FILTERS: [Filter, string][] = [
  ["all", "Everyone"], ["above", "Above the line"], ["below", "Below the line"], ["unsent", "Not sent yet"], ["sent", "Sent"],
];

export function MiniBar({ criteria, wide = false }: { criteria: DashboardRow["criteria"]; wide?: boolean }) {
  return (
    <div className={`flex gap-1 ${wide ? "h-3 w-full" : "h-2.5 w-36"}`} role="img" aria-label={criteria.map((c) => `${c.name}: ${c.score} of ${c.max}`).join(", ")}>
      {criteria.map((c) => (
        <div
          key={c.name}
          title={`${c.name}: ${c.score}/${c.max} (weight ${c.weight}%)`}
          style={{ width: `${c.weight}%` }}
          className={`rounded-full ${c.score >= c.max ? "bg-leaf-500" : c.score > 0 ? "bg-sun-500" : "bg-line"}`}
        />
      ))}
    </div>
  );
}

export function BandChip({ band }: { band: DashboardRow["band"] }) {
  if (band === "above") return <span className="chip bg-leaf-100 text-leaf-800"><Icon name="check" size={13} />Above the line</span>;
  if (band === "top5_below_bar") return <span className="chip bg-sun-100 text-sun-800">Top {SHORTLIST_SIZE}, below the bar</span>;
  return <span className="chip bg-sand text-muted">Below the line</span>;
}

export function EmailChip({ r }: { r: Pick<DashboardRow, "emailStatus" | "emailType"> }) {
  const tone =
    r.emailStatus === "Sent" ? "bg-leaf-700 text-white"
    : r.emailStatus === "Outdated" || r.emailStatus === "Send failed" ? "bg-clay-100 text-clay-700"
    : r.emailStatus === "Edited" ? "bg-bark-100 text-bark-700"
    : "bg-sand text-muted";
  const label = r.emailStatus === "Outdated" ? "Draft outdated" : r.emailStatus === "None" ? "No draft yet" : r.emailStatus;
  return (
    <span className={`chip ${tone}`}>
      {r.emailStatus === "Sent" && <Icon name="mailCheck" size={13} />}
      {label}{r.emailType && r.emailStatus !== "None" ? ` · ${r.emailType}` : ""}
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

  const Divider = ({ children, tone }: { children: React.ReactNode; tone: "leaf" | "sun" }) => (
    <tr>
      <td colSpan={7} className="px-4 py-2">
        <div className="flex items-center gap-3">
          <div className={`h-px flex-1 ${tone === "leaf" ? "bg-leaf-500" : "border-t border-dashed border-sun-500 bg-transparent"}`} />
          <span className={`chip ${tone === "leaf" ? "bg-leaf-600 text-white" : "bg-sun-100 text-sun-800"}`}>{children}</span>
          <div className={`h-px flex-1 ${tone === "leaf" ? "bg-leaf-500" : "border-t border-dashed border-sun-500 bg-transparent"}`} />
        </div>
      </td>
    </tr>
  );

  return (
    <div className="card card-flush">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line/70 px-4 py-3">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`min-h-9 rounded-full px-3.5 text-xs font-semibold transition duration-500 ease-spring active:scale-[0.97] ${filter === f ? "bg-ink text-white" : "text-muted hover:bg-sand hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto hidden text-xs text-muted md:inline"><kbd>j</kbd> <kbd>k</kbd> to move · <kbd>Enter</kbd> to open</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">#</th>
              <th className="px-2 font-medium">Candidate</th>
              <th className="px-2 text-right font-medium">Score</th>
              <th className="px-2 font-medium">Criteria</th>
              <th className="px-2 font-medium">Line</th>
              <th className="px-2 font-medium">Other role</th>
              <th className="px-4 font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {filter === "all" && lastAbove === -1 && <Divider tone="leaf">The line · nobody is in the top {SHORTLIST_SIZE} with ≥ {MIN_SCORE} yet</Divider>}
            {shown.map((r, i) => (
              <Fragment key={r.id}>
                <tr
                  id={`row-${i}`}
                  onClick={() => router.push(`/candidates/${r.id}`)}
                  onMouseEnter={() => setSel(i)}
                  className={`cursor-pointer border-t border-line/60 align-middle transition-colors duration-300 ${i === sel ? "bg-leaf-50" : "hover:bg-cream"}`}
                >
                  <td className="px-4 py-3 font-display text-base font-semibold text-muted">{r.rank}{r.tiedCount > 0 ? "=" : ""}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name} size={34} />
                      <div className="min-w-0">
                        <Link href={`/candidates/${r.id}`} className="font-semibold text-ink no-underline hover:text-leaf-700" onClick={(e) => e.stopPropagation()}>
                          {r.name}
                        </Link>
                        {!r.reviewed && <span className="chip ml-1.5 bg-bark-100 text-bark-700">new</span>}
                        <p className="max-w-xs truncate text-xs text-muted">{r.headline ?? "–"}</p>
                        {r.tiebreakNote && <p className="mt-1 flex max-w-sm items-start gap-1.5 text-[11px] leading-snug text-muted"><Icon name="scale" size={13} className="mt-px" /><span>{r.tiebreakNote}</span></p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 text-right">
                    <span className="font-display text-lg font-semibold">{r.total}</span>
                    <span className="block whitespace-nowrap text-[11px] text-muted">{other} {r.otherTotal ?? "–"}</span>
                  </td>
                  <td className="px-2"><MiniBar criteria={r.criteria} /></td>
                  <td className="px-2"><BandChip band={r.band} /></td>
                  <td className="px-2">
                    {r.crossRoleFit ? <span className="chip bg-bark-100 text-bark-700"><Icon name="sparkle" size={13} />{other} top {SHORTLIST_SIZE}</span> : <span className="text-line">–</span>}
                  </td>
                  <td className="px-4"><EmailChip r={r} /></td>
                </tr>
                {filter === "all" && i === lastAbove && <Divider tone="leaf">The line · top {SHORTLIST_SIZE} and ≥ {MIN_SCORE}</Divider>}
                {filter === "all" && i === lastTop5 && lastTop5 !== lastAbove && <Divider tone="sun">End of top {SHORTLIST_SIZE}: rows between the lines are under the {MIN_SCORE} bar</Divider>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-3 border-t border-line/70 px-4 py-3 text-xs text-muted">
        Criteria bar, sized by weight:
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-full bg-leaf-500" /> strong</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-full bg-sun-500" /> partial</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-full bg-line" /> weak / none</span>
        · hover a segment for details
      </p>
    </div>
  );
}
