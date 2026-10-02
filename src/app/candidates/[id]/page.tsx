import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BandChip } from "@/app/DashboardTable";
import { Avatar } from "@/components/Brand";
import { ErrorBox, errorMessage } from "@/components/ErrorBox";
import { Icon } from "@/components/Icons";
import { RetryButton } from "@/components/PipelineButtons";
import { MIN_SCORE, ROLE_LABEL, otherRole, type Role } from "@/lib/constants";
import { markReviewed } from "@/lib/pipeline";
import { getCandidate, type CandidateDetail } from "@/lib/queries";
import { EMAIL_KIND_LABEL } from "@/lib/ranking";
import { ChangeRoleButton, DeleteButton, NameForm } from "./CandidateActions";
import { EmailPanel } from "./EmailPanel";

export const metadata: Metadata = { title: "Candidate" };
export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  uploaded: "Uploaded (file discarded after text extraction)",
  name_entered: "Name entered by Arjun",
  name_corrected: "Name corrected by Arjun",
  scored: "Scored",
  line_changed: "Moved across the line",
  brief_generated: "Brief generated",
  brief_hidden: "Brief hidden (dropped out of the top 5)",
  brief_shown: "Brief shown again (back in the top 5)",
  draft_generated: "Email draft generated",
  draft_edited: "Draft edited by Arjun",
  draft_outdated: "Draft outdated (recommendation changed after your edit)",
  override: "Arjun overrode the recommendation",
  override_cleared: "Override cleared",
  send_confirmed: "Arjun confirmed the send",
  sent: "Email sent",
  send_failed: "Send failed",
  rescore_requested: "Re-score requested",
  reviewed: "First opened by Arjun",
  guardrail_blocked: "PII guardrail blocked AI processing",
  error: "Error",
};

const delay = (i: number) => ({ "--i": i }) as React.CSSProperties;

function fmt(d: string) {
  return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

function RoleSummary({ d, role, i }: { d: CandidateDetail; role: Role; i: number }) {
  const r = d.roles[role];
  const t = r.total;
  const applied = d.candidate.applied_role === role;
  const total = t ? Number(t.total) : 0;
  return (
    <div className="card reveal" style={delay(i)}>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{ROLE_LABEL[role]}</p>
        <span className={`chip ${applied ? "bg-leaf-100 text-leaf-800" : "bg-sand text-muted"}`}>{applied ? "Applied for" : "Also scored"}</span>
      </div>
      {t ? (
        <>
          <p className="mt-4 font-display text-6xl font-semibold leading-none tracking-tight">
            {total}<span className="ml-1.5 font-sans text-base font-normal text-muted">/ 100</span>
          </p>
          <div className="relative mt-6 h-2.5 rounded-full bg-sand" role="img" aria-label={`Score ${total} out of 100; the bar is ${MIN_SCORE}`}>
            <div className={`h-2.5 rounded-full transition-[width] duration-1000 ease-spring ${total >= MIN_SCORE ? "bg-leaf-600" : "bg-sun-500"}`} style={{ width: `${Math.min(100, total)}%` }} />
            <div className="absolute -top-1.5 h-5 w-0.5 rounded bg-ink/70" style={{ left: `${MIN_SCORE}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted" style={{ paddingLeft: `calc(${MIN_SCORE}% - 1rem)` }}>bar {MIN_SCORE}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {applied ? (
              <>
                <span>Rank <b>{t.rank}{t.tied_count ? " (tied)" : ""}</b> of {r.poolSize}</span>
                <BandChip band={t.band} />
              </>
            ) : (
              <span className="text-muted">Would rank <b className="text-ink">{t.rank}</b> among {r.poolSize} {role} applicants</span>
            )}
          </div>
          {applied && t.band === "top5_below_bar" && (
            <p className="mt-4 rounded-2xl bg-sun-50 px-4 py-3 text-xs leading-relaxed text-sun-800">In the top 5, but under the {MIN_SCORE} bar, so the default draft is a rejection. Your call.</p>
          )}
          {applied && t.cross_role_fit && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-bark-100 px-4 py-3 text-xs leading-relaxed text-bark-700">
              <Icon name="sparkle" size={15} className="mt-px" />Their {otherRole(role)} score would put them above the {otherRole(role)} line too.
            </p>
          )}
          {t.tiebreak_note && (
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted"><Icon name="scale" size={15} className="mt-px" />{t.tiebreak_note}</p>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">Not scored yet.</p>
      )}
    </div>
  );
}

function CriteriaTable({ d, role, i }: { d: CandidateDetail; role: Role; i: number }) {
  const r = d.roles[role];
  if (!r.criteria.some((c) => c.result)) return null;
  const max = d.rubric.current.max_score;
  return (
    <section className="card reveal" style={delay(i)} aria-label={`${ROLE_LABEL[role]} scores`}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2>{ROLE_LABEL[role]}: why this score</h2>
        <p className="text-xs text-muted">Total = sum of score ÷ {max} × weight, computed in code = <b className="text-ink">{r.total ? Number(r.total.total) : "–"}</b></p>
      </div>
      <ol className="space-y-3">
        {r.criteria.map((c) => {
          const s = c.result;
          const pts = s ? Math.round((s.score / c.max_score) * Number(c.weight) * 10) / 10 : 0;
          const tone = !s ? "bg-sand text-muted" : s.score >= max ? "bg-leaf-100 text-leaf-800" : s.score > 0 ? "bg-sun-100 text-sun-800" : "bg-sand text-muted";
          const word = !s ? "Not scored" : s.score >= max ? "Strong" : s.score > 0 ? "Partial" : "Weak";
          return (
            <li key={c.id} className="rounded-2xl bg-cream p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-semibold">{c.name}</p>
                <span className="text-xs text-muted">weight {Number(c.weight)}%</span>
                <span className="ml-auto flex items-center gap-2.5">
                  <span className={`chip ${tone}`}>{word}{s ? ` · ${s.score}/${c.max_score}` : ""}</span>
                  <span className="text-xs tabular-nums text-muted">+{pts} pts</span>
                </span>
              </div>
              {s?.reason && <p className="mt-2 text-sm leading-relaxed">{s.reason}</p>}
              {s?.evidence ? (
                <blockquote className="mt-3 border-l-[3px] border-leaf-200 pl-4 text-sm italic leading-relaxed text-muted">
                  &ldquo;{s.evidence}&rdquo;
                  {!s.evidence_verified && <span className="chip ml-2 bg-clay-50 not-italic text-clay-700" title="Not found word-for-word in the CV. Check it.">not found verbatim</span>}
                </blockquote>
              ) : (
                <p className="mt-2 text-xs text-muted">No evidence in the CV.</p>
              )}
              {s?.capped && <p className="mt-2 text-xs text-muted" title={`Model said ${s.model_score}`}>Capped to 0: the PM test for this criterion wasn&apos;t Strong.</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let d: CandidateDetail | null;
  try {
    d = await getCandidate(id);
    if (d) await markReviewed(id);
  } catch (e) {
    return <ErrorBox title="Couldn't load this candidate" message={errorMessage(e)} retryHref={`/candidates/${id}`} />;
  }
  if (!d) notFound();
  const { candidate: c, pii } = d;
  const applied = c.applied_role;
  const scoredWithOld = d.rubric.scoredWith && d.rubric.scoredWith.id !== d.rubric.current.id;

  return (
    <div className="space-y-10">
      <Link href={`/?role=${applied}`} className="reveal inline-flex items-center gap-2 text-sm text-muted no-underline hover:text-ink">
        <Icon name="arrowLeft" size={16} /> Back to the {applied} shortlist
      </Link>

      <header className="card reveal flex flex-wrap items-center gap-6 p-7" style={delay(1)}>
        <Avatar name={pii?.name ?? "?"} size={76} />
        <div className="min-w-0 flex-1">
          <h1>{pii?.name ?? "Name needed"}</h1>
          <p className="mt-1.5 text-muted">{c.headline ?? "No headline yet"}</p>
          <ul className="mt-4 flex min-w-0 flex-wrap gap-2 text-xs">
            <li className="chip bg-leaf-50 text-leaf-800">Applied: {ROLE_LABEL[applied]}</li>
            <li className="chip chip-wrap bg-sand text-muted"><Icon name="mail" size={13} />{pii?.email ?? "no email found"}</li>
            <li className="chip chip-wrap bg-sand text-muted"><Icon name="phone" size={13} />{pii?.phone ?? "no phone found"}</li>
            {pii?.links?.map((l) => <li key={l} className="chip chip-wrap bg-sand text-muted"><Icon name="link" size={13} />{l}</li>)}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.stage !== "needs_name" && (c.status === "error" || c.stage !== "drafted") && <RetryButton id={c.id} />}
          {c.stage !== "needs_name" && c.status !== "processing" && <RetryButton id={c.id} rescore label="Re-score" />}
          <ChangeRoleButton id={c.id} current={applied} />
          <DeleteButton id={c.id} />
        </div>
      </header>

      {c.status === "error" && <ErrorBox title="The last step failed" message={c.error ?? "Unknown error"} />}
      {(c.stage === "needs_name" || !pii?.name_confident) && <NameForm id={c.id} current={pii?.name ?? ""} required={c.stage === "needs_name"} />}
      {scoredWithOld && (
        <p className="rounded-2xl bg-sun-50 px-5 py-3.5 text-sm text-sun-800">
          Scored with rubric {d.rubric.scoredWith!.label}; the current rubric is {d.rubric.current.label}. Press Re-score.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <RoleSummary d={d} role={applied} i={2} />
        <RoleSummary d={d} role={otherRole(applied)} i={3} />
      </div>

      {d.brief && !d.brief.hidden && (
        <section className="card-tint reveal p-8" style={delay(4)} aria-label="Interview brief">
          <p className="flex items-center gap-2 text-sm font-semibold text-leaf-700"><Icon name="note" size={17} />Interview brief</p>
          <p className="mt-3 max-w-prose font-display text-[1.35rem] leading-snug text-leaf-800">{d.brief.text}</p>
          <p className="mt-4 text-xs text-muted">Written {fmt(d.brief.generated_at)} from the scores and the redacted CV{d.brief.used_jd ? ", with the JD for role context" : ""}.</p>
        </section>
      )}
      {d.brief?.hidden && (
        <details className="card text-sm text-muted">
          <summary className="cursor-pointer">Brief hidden: they&apos;re no longer in the top 5</summary>
          <p className="mt-3">{d.brief.text}</p>
        </details>
      )}

      <CriteriaTable d={d} role={applied} i={5} />
      <CriteriaTable d={d} role={otherRole(applied)} i={6} />

      {c.stage !== "needs_name" && (
        <EmailPanel id={c.id} email={d.email} recommendedKind={d.recommendedKind} kindLabels={EMAIL_KIND_LABEL} appliedRole={applied} ranked={!!d.roles[applied].total} />
      )}

      <details className="card">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Icon name="eye" size={18} />Show what the AI saw</summary>
        <p className="mt-3 max-w-prose text-xs text-muted">
          This redacted text is the only CV content ever sent to Gemini. Name, email, phone, links and personal-detail lines were removed in code before any AI call.
        </p>
        <pre className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-cream p-5 font-sans text-xs leading-relaxed">{c.cv_content}</pre>
      </details>

      <section className="card" aria-labelledby="history">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="history">History</h2>
          <p className="text-xs text-muted">Rubric {d.rubric.scoredWith?.label ?? "not scored yet"}</p>
        </div>
        <ol className="mt-6">
          {d.events.map((e, i) => (
            <li key={e.id} className="relative flex gap-4 pb-5 last:pb-0">
              {i < d.events.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-line" aria-hidden="true" />}
              <span className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-paper ${e.action === "sent" ? "bg-leaf-600" : e.action.includes("error") || e.action.includes("fail") ? "bg-clay-500" : "bg-line"}`} />
              <div className="text-sm">
                <p><span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span> <span className="ml-1 text-xs text-muted">{fmt(e.at)}</span></p>
                {Object.keys(e.detail ?? {}).length > 0 && (
                  <p className="mt-0.5 text-xs text-muted">
                    {Object.entries(e.detail).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`).join(" · ")}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
