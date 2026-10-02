import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Brand";
import { ErrorBox, errorMessage } from "@/components/ErrorBox";
import { Icon } from "@/components/Icons";
import { RetryButton, SyncButton } from "@/components/PipelineButtons";
import { ShortlistCard } from "@/components/ShortlistCard";
import { MIN_SCORE, SHORTLIST_SIZE, type Role } from "@/lib/constants";
import { getDashboard, type Dashboard } from "@/lib/queries";
import { DashboardTable } from "./DashboardTable";

export const metadata: Metadata = { title: "Shortlist" };
export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const delay = (i: number) => ({ "--i": i }) as React.CSSProperties;

function Stat({ label, value, hint, className = "", i = 0 }: { label: string; value: number | string; hint?: string; className?: string; i?: number }) {
  return (
    <div className={`card reveal ${className}`} style={delay(i)}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-display text-4xl font-semibold leading-none tracking-tight">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
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
  const filled = Math.min(data.counts.aboveLine, SHORTLIST_SIZE);

  return (
    <div className="space-y-12">
      <header className="reveal flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-xl">
          <span className="eyebrow-pill">{roleName} · rubric {data.rubricLabel}</span>
          <h1 className="mt-4">{greeting()}, Arjun</h1>
          <p className="mt-3 max-w-prose text-muted">
            {ranked.length
              ? `${data.counts.aboveLine} ${data.counts.aboveLine === 1 ? "person is" : "people are"} above the line for ${role}. Start with them, then check anyone marked below the bar.`
              : "No candidates scored yet. Upload a few CVs and your first shortlist appears here."}
          </p>
        </div>
        <div role="tablist" aria-label="Role" className="flex rounded-full bg-paper p-1 shadow-[0_0_0_1px_rgb(120_95_55/0.12),0_1px_2px_rgb(90_65_25/0.08)]">
          {(["PM", "SPM"] as Role[]).map((x) => (
            <Link
              key={x}
              href={`/?role=${x}`}
              role="tab"
              aria-selected={x === role}
              className={`flex min-h-10 items-center rounded-full px-5 text-sm font-semibold no-underline transition duration-500 ease-spring active:scale-[0.97] ${x === role ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
            >
              {x === "PM" ? "Product Manager" : "Senior PM"}
            </Link>
          ))}
        </div>
      </header>

      <section aria-label="Summary" className="grid grid-cols-2 gap-5 lg:grid-cols-12">
        <div className="card reveal col-span-2 lg:col-span-5" style={delay(1)}>
          <p className="text-sm text-muted">Above the line</p>
          <div className="mt-2 flex items-end gap-3">
            <p className="font-display text-6xl font-semibold leading-none tracking-tight">{data.counts.aboveLine}</p>
            <p className="pb-1.5 text-sm text-muted">of {SHORTLIST_SIZE} shortlist places</p>
          </div>
          <div className="mt-5 flex gap-2" role="img" aria-label={`${filled} of ${SHORTLIST_SIZE} shortlist places filled`}>
            {Array.from({ length: SHORTLIST_SIZE }, (_, i) => (
              <span key={i} className={`h-2.5 flex-1 rounded-full transition-colors duration-700 ${i < filled ? "bg-leaf-600" : "bg-sand"}`} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            {data.counts.aboveLine > SHORTLIST_SIZE ? `More than ${SHORTLIST_SIZE}: ties at the cut-off. ` : ""}A place needs a top-{SHORTLIST_SIZE} rank <b className="font-semibold text-ink">and</b> a score of {MIN_SCORE}+.
          </p>
        </div>
        <Stat label="Applicants" value={data.counts.applicants} hint={`applied for ${role}`} className="lg:col-span-3" i={2} />
        <Stat label="Reviewed" value={data.counts.reviewed} hint="profiles you've opened" className="lg:col-span-2" i={3} />
        <Stat label="Emails sent" value={data.counts.sent} hint="each one confirmed" className="lg:col-span-2" i={4} />
      </section>

      {data.pendingDrafts > 0 && (
        <div className="card-tint reveal flex flex-wrap items-center gap-4 bg-sun-50 py-4" style={{ ...delay(5), boxShadow: "0 0 0 6px rgb(217 165 33 / 0.07), 0 0 0 7px rgb(217 165 33 / 0.2)" }}>
          <Icon name="pen" size={20} className="text-sun-800" />
          <p className="min-w-0 flex-1 text-sm text-sun-800">{data.pendingDrafts} candidate(s) need a fresh brief or email draft because the rankings moved.</p>
          <SyncButton />
        </div>
      )}

      {data.bookingLinkProblem && (
        <div role="alert" className="card-tint reveal flex flex-wrap items-center gap-4 bg-clay-50 py-4" style={{ ...delay(5), boxShadow: "0 0 0 6px rgb(208 116 63 / 0.06), 0 0 0 7px rgb(208 116 63 / 0.18)" }}>
          <Icon name="link" size={20} className="text-clay-700" />
          <p className="min-w-0 flex-1 text-sm text-clay-700">
            <b>Invites can&apos;t be sent yet.</b> {data.bookingLinkProblem} Put Arjun&apos;s real booking link in <code>SCHEDULING_LINK</code> (Vercel → Settings → Environment Variables) and redeploy.
          </p>
        </div>
      )}

      {attention.length > 0 && (
        <section aria-labelledby="attention" className="reveal" style={delay(5)}>
          <h2 id="attention" className="mb-4 flex items-center gap-2">Needs your attention <span className="chip bg-clay-100 text-clay-700">{attention.length}</span></h2>
          <ul className="grid gap-3">
            {attention.map((x) => (
              <li key={x.id} className="card flex flex-wrap items-center gap-3 py-3.5">
                <Avatar name={x.name} size={34} />
                <Link href={`/candidates/${x.id}`} className="font-semibold text-ink">{x.name}</Link>
                <span className="chip bg-sand text-muted">
                  {x.staleRubric ? "Scored with an older rubric" : x.status === "needs_name" ? "Needs a name" : x.status === "error" ? "A step failed" : `In progress (${x.stage})`}
                </span>
                {x.error && <span className="text-xs text-clay-700">{x.error}</span>}
                <span className="ml-auto">
                  {x.status === "needs_name" ? <Link href={`/candidates/${x.id}`} className="btn no-underline">Enter name</Link> : <RetryButton id={x.id} rescore={x.staleRubric} />}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ranked.length === 0 ? (
        <section className="card reveal flex flex-col items-center px-8 py-20 text-center" style={delay(5)}>
          <span className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-leaf-100 text-leaf-700"><Icon name="sprout" size={30} /></span>
          <h2 className="mt-6 text-3xl">Your {role} shortlist will grow here</h2>
          <p className="mt-3 max-w-md text-muted">
            Each CV you upload is scored against the rubric built from your best hires. You get a ranked list, the reasons behind every score, and a draft email for everyone.
          </p>
          <Link href="/upload" className="btn-cta mt-8 no-underline">
            Upload CVs
            <span className="btn-dot"><Icon name="arrowUpRight" size={16} /></span>
          </Link>
        </section>
      ) : (
        <>
          <section aria-labelledby="shortlist">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="shortlist" className="text-2xl">Your shortlist</h2>
              <p className="text-xs text-muted">Top {SHORTLIST_SIZE} by score. Green is above the {MIN_SCORE} bar, yellow is in the top {SHORTLIST_SIZE} but below it.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shortlist.map((x, i) => <ShortlistCard key={x.id} r={x} featured={i === 0} index={i + 1} />)}
            </div>
          </section>

          <section aria-labelledby="everyone" className="reveal" style={delay(3)}>
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="everyone" className="text-2xl">Everyone, ranked</h2>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer rounded-full px-3 py-1.5 hover:bg-sand">How the line works</summary>
                <p className="mt-2 max-w-md rounded-2xl bg-paper p-4 leading-relaxed shadow-[0_0_0_1px_rgb(120_95_55/0.12)]">
                  The line is the top {SHORTLIST_SIZE} among {role} applicants <b>and</b> at least {MIN_SCORE}/100. Equal totals are ordered by the highest-weighted criterion;
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
