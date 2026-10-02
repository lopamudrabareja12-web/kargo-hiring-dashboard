import Link from "next/link";
import { BandChip, EmailChip, MiniBar } from "@/app/DashboardTable";
import type { DashboardRow } from "@/lib/queries";
import { Avatar } from "./Brand";
import { Icon } from "./Icons";

export function ShortlistCard({ r, featured = false, index = 0 }: { r: DashboardRow; featured?: boolean; index?: number }) {
  const above = r.band === "above";
  return (
    <Link
      href={`/candidates/${r.id}`}
      style={{ "--i": index } as React.CSSProperties}
      className={`card card-hover reveal group block no-underline ${featured ? "lg:col-span-2 lg:p-8" : ""} ${above ? "" : "bg-sun-50"}`}
    >
      <div className="flex items-start gap-4">
        <Avatar name={r.name} size={featured ? 64 : 48} />
        <div className="min-w-0 flex-1">
          <p className={`truncate font-display font-semibold tracking-tight text-ink transition-colors duration-500 group-hover:text-leaf-700 ${featured ? "text-2xl" : "text-lg"}`}>{r.name}</p>
          <p className={`mt-0.5 text-muted ${featured ? "text-sm" : "line-clamp-2 text-xs"}`}>{r.headline ?? "No headline yet"}</p>
        </div>
        <div className="text-right">
          <p className={`font-display font-semibold leading-none tracking-tight ${featured ? "text-5xl" : "text-3xl"}`}>{r.total}</p>
          <p className="mt-1.5 text-xs text-muted">rank {r.rank}{r.tiedCount ? " (tied)" : ""}</p>
        </div>
      </div>
      {featured && (
        <div className="mt-6">
          <p className="mb-2 text-xs text-muted">Strength on each criterion</p>
          <MiniBar criteria={r.criteria} wide />
        </div>
      )}
      <div className={`flex flex-wrap items-center gap-1.5 ${featured ? "mt-6" : "mt-5"}`}>
        <BandChip band={r.band} />
        {r.crossRoleFit && <span className="chip bg-bark-100 text-bark-700"><Icon name="sparkle" size={13} />Fits the other role</span>}
        {r.hasBrief && <span className="chip bg-sand text-muted"><Icon name="note" size={13} />Brief</span>}
        <span className="ml-auto"><EmailChip r={r} /></span>
      </div>
    </Link>
  );
}
