import Link from "next/link";
import { BandChip, EmailChip } from "@/app/DashboardTable";
import type { DashboardRow } from "@/lib/queries";
import { Avatar } from "./Brand";

export function ShortlistCard({ r }: { r: DashboardRow }) {
  const above = r.band === "above";
  return (
    <Link
      href={`/candidates/${r.id}`}
      className={`group block rounded-3xl border p-5 no-underline shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift ${
        above ? "border-leaf-100 bg-white" : "border-sun-100 bg-sun-50/60"
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar name={r.name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink group-hover:text-leaf-700">{r.name}</p>
          <p className="line-clamp-2 text-xs text-muted">{r.headline ?? "–"}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-semibold leading-none text-ink">{r.total}</p>
          <p className="mt-1 text-[11px] text-muted">rank {r.rank}{r.tiedCount ? "=" : ""}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <BandChip band={r.band} />
        {r.crossRoleFit && <span className="chip bg-plum-50 text-plum-700">✦ fits other role</span>}
        {r.hasBrief && <span className="chip bg-sand text-muted">📝 brief</span>}
        <span className="ml-auto"><EmailChip r={r} /></span>
      </div>
    </Link>
  );
}
