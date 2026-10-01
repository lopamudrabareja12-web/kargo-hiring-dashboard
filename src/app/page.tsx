import Link from "next/link";
import { ErrorBox, errorMessage } from "@/components/ErrorBox";
import { MIN_SCORE, SHORTLIST_SIZE, type Role } from "@/lib/constants";
import { getDashboard, type Dashboard } from "@/lib/queries";
import { DashboardTable } from "./DashboardTable";
import { RetryButton, SyncButton } from "@/components/PipelineButtons";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role: r } = await searchParams;
  const role: Role = r === "SPM" ? "SPM" : "PM";
  let data: Dashboard;
  try {
    data = await getDashboard(role);
  } catch (e) {
    return <ErrorBox title="Could not load the dashboard" message={errorMessage(e)} retryHref={`/?role=${role}`} />;
  }
  const ranked = data.rows.filter((x) => x.rank !== null && !x.staleRubric);
  const attention = data.rows.filter((x) => x.rank === null || x.status === "error" || x.status === "needs_name" || x.staleRubric);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="flex gap-1">
          {(["PM", "SPM"] as Role[]).map((x) => (
            <Link key={x} href={`/?role=${x}`} className={`rounded px-3 py-1.5 text-sm ${x === role ? "bg-neutral-900 text-white" : "border border-neutral-300 hover:bg-neutral-50"}`}>
              {x === "PM" ? "Product Manager" : "Senior Product Manager"}
            </Link>
          ))}
        </div>
        <div className="flex gap-5 text-sm">
          <span><b>{data.counts.applicants}</b> applicants</span>
          <span><b>{data.counts.reviewed}</b> reviewed</span>
          <span><b>{data.counts.sent}</b> sent</span>
          <span>
            <b>{data.counts.aboveLine}</b> above the line
            {data.counts.aboveLine > SHORTLIST_SIZE && (
              <span className="chip ml-1 bg-amber-100 text-amber-900">more than {SHORTLIST_SIZE}: ties at the cut-off</span>
            )}
          </span>
          {data.counts.top5BelowBar > 0 && <span><b>{data.counts.top5BelowBar}</b> top 5, below bar</span>}
        </div>
        <span className="ml-auto text-xs text-neutral-500">Rubric {data.rubricLabel}</span>
      </div>

      <p className="rounded bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
        <b>The line</b> = top {SHORTLIST_SIZE} by total among {role} applicants <b>and</b> a total of at least <b>{MIN_SCORE}</b>/100.
        Top-5 candidates under {MIN_SCORE} are shown as &ldquo;Top 5, below bar&rdquo;: they get a brief and a rejection draft by default, and you decide.
        Equal totals are ordered by the highest-weighted criterion; candidates identical on every criterion share a rank.
        Totals are computed in code from the per-criterion scores.
      </p>

      {data.pendingDrafts > 0 && (
        <div className="flex items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          <span>{data.pendingDrafts} candidate(s) need a brief or a draft update because ranks moved.</span>
          <SyncButton />
        </div>
      )}

      {attention.length > 0 && (
        <div className="card border-amber-300">
          <h2>Needs attention ({attention.length})</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {attention.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/candidates/${x.id}`} className="font-medium underline">{x.name}</Link>
                <span className="chip bg-neutral-100">
                  {x.staleRubric ? "scored with an older rubric" : x.status === "needs_name" ? "needs name" : x.status === "error" ? "error" : `in progress (${x.stage})`}
                </span>
                {x.error && <span className="text-xs text-red-700">{x.error}</span>}
                {x.status === "needs_name" ? (
                  <Link href={`/candidates/${x.id}`} className="btn">Enter name</Link>
                ) : (
                  <RetryButton id={x.id} rescore={x.staleRubric} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ranked.length === 0 ? (
        <p className="text-sm text-neutral-600">
          No scored {role} candidates yet. <Link href="/upload" className="underline">Upload CVs</Link>.
        </p>
      ) : (
        <DashboardTable rows={ranked} role={role} />
      )}
    </div>
  );
}
