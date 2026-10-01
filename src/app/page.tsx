import Link from "next/link";
import { Avatar } from "@/components/Brand";
import { ErrorBox, errorMessage } from "@/components/ErrorBox";
import { RetryButton, SyncButton } from "@/components/PipelineButtons";
import { MIN_SCORE, SHORTLIST_SIZE, type Role } from "@/lib/constants";
import { getDashboard, type Dashboard } from "@/lib/queries";
import { ShortlistCard } from "@/components/ShortlistCard";
import { DashboardTable } from "./DashboardTable";

export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Stat({ label, value, hint, tone = "leaf" }: { label: string; value: number | string; hint?: string; tone?: "leaf" | "sun" | "clay" | "plum" }) {
  const dot = { leaf: "bg-leaf-500", sun: "bg-sun-500", clay: "bg-clay-500", plum: "bg-plum-700" }[tone];
  return (
    <div className="card p-5">
      <p className="flex items-center gap-2 text-sm text-muted"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role: r } = await searchParams;
  const role: Role = r === "SPM" ? "SPM" : "PM";
  let data: Dashboard;
  try {
    data = await getDashboard(role);
  } catch (e) {
    return <ErrorBox title="Couldn't load the dashboard" message={errorMessage(e)} retryHref={`/?role=${role}`} />;
  }
  const ranked = data.rows.filter((x) => x.rank !== null && !x.staleRubric);
  const attention = data.rows.filter((x) => x.rank === null || x.status === "error" || x.status === "needs_name" || x.staleRubric);
  const shortlist = ranked.filter((x) => x.inTop5);
  const roleName = role === "PM" ? "Product Manager" : "Senior Product Manager";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{roleName} · rubric {data.rubricLabel}</p>
          <h1 className="mt-1">{greeting()}, Arjun</h1>
          <p className="mt-1 text-muted">
            {ranked.length
              ? `${data.counts.aboveLine} ${data.counts.aboveLine === 1 ? "person is" : "people are"} above the line for ${role}. Start with them.`
              : "No candidates scored yet. Upload a few CVs to get your first shortlist."}
          </p>
        </div>
        <div className="flex rounded-full border border-line/70 bg-white p-1 shadow-sm">
          {(["PM", "SPM"] as Role[]).map((x) => (
            <Link
              key={x}
              href={`/?role=${x}`}
              className={`rounded-full px-5 py-2 text-sm font-semibold no-underline transition ${x === role ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
            >
              {x === "PM" ? "Product Manager" : "Senior PM"}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Applicants" value={data.counts.applicants} hint={`applied for ${role}`} tone="plum" />
        <Stat
          label="Above the line"
          value={data.counts.aboveLine}
          hint={data.counts.aboveLine > SHORTLIST_SIZE ? `more than ${SHORTLIST_SIZE}: ties at the cut-off` : `top ${SHORTLIST_SIZE} and ≥ ${MIN_SCORE}`}
          tone="leaf"
        />
        <Stat label="Reviewed" value={data.counts.reviewed} hint="profiles you've opened" tone="sun" />
        <Stat label="Emails sent" value={data.counts.sent} hint="each one confirmed by you" tone="clay" />
      </div>

      {data.pendingDrafts > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-sun-100 bg-sun-50 px-5 py-4 text-sm text-sun-800">
          <span aria-hidden>✍️</span>
          <span className="flex-1">{data.pendingDrafts} candidate(s) need a fresh brief or email draft because the rankings moved.</span>
          <SyncButton />
        </div>
      )}

      {attention.length > 0 && (
        <div className="rounded-3xl border border-clay-100 bg-clay-50/70 p-5">
          <h2 className="flex items-center gap-2">Needs your attention <span className="chip bg-white text-clay-700">{attention.length}</span></h2>
          <ul className="mt-3 space-y-2">
            {attention.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-2.5 text-sm shadow-sm">
                <Avatar name={x.name} size={28} />
                <Link href={`/candidates/${x.id}`} className="font-medium text-ink">{x.name}</Link>
                <span className="chip bg-sand text-muted">
                  {x.staleRubric ? "scored with an older rubric" : x.status === "needs_name" ? "needs a name" : x.status === "error" ? "something failed" : `in progress (${x.stage})`}
                </span>
                {x.error && <span className="text-xs text-clay-700">{x.error}</span>}
                <span className="ml-auto">
                  {x.status === "needs_name" ? <Link href={`/candidates/${x.id}`} className="btn no-underline">Enter name</Link> : <RetryButton id={x.id} rescore={x.staleRubric} />}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ranked.length === 0 ? (
        <div className="card flex flex-col items-center px-8 py-16 text-center">
          <span className="text-5xl" aria-hidden>🌱</span>
          <h2 className="mt-4 text-2xl">Your {role} shortlist will grow here</h2>
          <p className="mt-2 max-w-md text-muted">
            Upload CVs and each one is scored against the rubric built from your best hires. You&apos;ll get a ranked list, the reasons behind every score, and a draft email for everyone.
          </p>
          <Link href="/upload" className="btn-primary mt-6 px-6 py-3 no-underline">Upload CVs</Link>
        </div>
      ) : (
        <>
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xl">Your shortlist</h2>
              <p className="text-xs text-muted">Top {SHORTLIST_SIZE} by score · green = above the {MIN_SCORE} bar · yellow = top {SHORTLIST_SIZE} but below it</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shortlist.map((x) => <ShortlistCard key={x.id} r={x} />)}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xl">Everyone, ranked</h2>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">How the line works</summary>
                <p className="mt-2 max-w-md rounded-2xl bg-white p-3 shadow-sm">
                  The line = top {SHORTLIST_SIZE} by total among {role} applicants <b>and</b> at least {MIN_SCORE}/100. Equal totals are ordered by the highest-weighted criterion;
                  people identical on every criterion share a rank. Totals are computed in code from the per-criterion scores, never by the AI.
                </p>
              </details>
            </div>
            <DashboardTable rows={ranked} role={role} />
          </section>
        </>
      )}
    </div>
  );
}
