import Link from "next/link";
import { notFound } from "next/navigation";
import { BandChip } from "@/app/DashboardTable";
import { ErrorBox, errorMessage } from "@/components/ErrorBox";
import { RetryButton } from "@/components/PipelineButtons";
import { MIN_SCORE, ROLE_LABEL, otherRole, type Role } from "@/lib/constants";
import { markReviewed } from "@/lib/pipeline";
import { getCandidate, type CandidateDetail } from "@/lib/queries";
import { EMAIL_KIND_LABEL } from "@/lib/ranking";
import { DeleteButton, NameForm } from "./CandidateActions";
import { EmailPanel } from "./EmailPanel";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  uploaded: "Uploaded (file discarded after text extraction)",
  name_entered: "Name entered by Arjun",
  name_corrected: "Name corrected by Arjun",
  scored: "Scored",
  line_changed: "Moved across the line",
  brief_generated: "Brief generated",
  brief_hidden: "Brief hidden (dropped out of top 5)",
  brief_shown: "Brief shown again (back in top 5)",
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

function fmt(d: string) {
  return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

function RoleSummary({ d, role }: { d: CandidateDetail; role: Role }) {
  const r = d.roles[role];
  const t = r.total;
  const applied = d.candidate.applied_role === role;
  return (
    <div className={`card ${applied ? "border-neutral-900" : ""}`}>
      <p className="text-xs text-neutral-500">{ROLE_LABEL[role]} {applied ? "(applied)" : "(not applied)"}</p>
      {t ? (
        <>
          <p className="mt-1 text-2xl font-semibold">{Number(t.total)}<span className="text-sm font-normal text-neutral-500">/100</span></p>
          <p className="mt-1 text-sm">
            {applied
              ? <>Rank <b>{t.rank}{t.tied_count ? "=" : ""}</b> of {r.poolSize} {role} applicants · <BandChip band={t.band} /></>
              : <>Would rank <b>{t.rank}</b> among {r.poolSize} {role} applicants</>}
          </p>
          {applied && t.band === "top5_below_bar" && (
            <p className="mt-1 text-xs text-amber-800">In the top 5, but below the {MIN_SCORE} bar, so the default draft is a rejection. Your call.</p>
          )}
          {applied && t.cross_role_fit && (
            <p className="mt-1 text-xs text-purple-800">Cross-role fit: their {otherRole(role)} score would put them above the {otherRole(role)} line.</p>
          )}
          {t.tiebreak_note && <p className="mt-1 text-xs text-neutral-600">{t.tiebreak_note}</p>}
        </>
      ) : (
        <p className="mt-1 text-sm text-neutral-500">Not scored yet.</p>
      )}
    </div>
  );
}

function CriteriaTable({ d, role }: { d: CandidateDetail; role: Role }) {
  const r = d.roles[role];
  if (!r.criteria.some((c) => c.result)) return null;
  const max = d.rubric.current.max_score;
  return (
    <div>
      <h2 className="mb-1">{ROLE_LABEL[role]}: per criterion</h2>
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-300 text-left text-xs text-neutral-500">
          <tr><th className="py-1 pr-2">Criterion</th><th className="pr-2">Weight</th><th className="pr-2">Score</th><th className="pr-2">Points</th><th className="pr-2">Reason</th><th>Evidence (quote from CV)</th></tr>
        </thead>
        <tbody>
          {r.criteria.map((c) => {
            const s = c.result;
            const pts = s ? Math.round((s.score / c.max_score) * Number(c.weight) * 10) / 10 : 0;
            return (
              <tr key={c.id} className="border-b border-neutral-100 align-top">
                <td className="py-1.5 pr-2 font-medium">{c.name}</td>
                <td className="pr-2">{Number(c.weight)}%</td>
                <td className="whitespace-nowrap pr-2">
                  <span className={`chip ${!s ? "" : s.score >= max ? "bg-green-100 text-green-800" : s.score > 0 ? "bg-amber-100 text-amber-900" : "bg-neutral-100"}`}>
                    {s ? `${s.score}/${c.max_score}` : "–"}
                  </span>
                  {s?.capped && <p className="mt-0.5 text-xs text-neutral-500" title={`Model said ${s.model_score}`}>capped: PM not Strong</p>}
                </td>
                <td className="pr-2">{pts}</td>
                <td className="pr-2 text-neutral-800">{s?.reason}</td>
                <td className="text-neutral-700">
                  {s?.evidence ? (
                    <>
                      <q className="italic">{s.evidence}</q>
                      {!s.evidence_verified && <span className="chip ml-1 bg-red-50 text-red-700" title="This quote was not found word-for-word in the CV. Check it.">not found verbatim</span>}
                    </>
                  ) : <span className="text-neutral-400">no evidence</span>}
                </td>
              </tr>
            );
          })}
          <tr className="text-xs text-neutral-500"><td colSpan={6} className="py-1">Total = sum of (score ÷ {max} × weight), computed in code = <b>{d.roles[role].total ? Number(d.roles[role].total!.total) : "–"}</b></td></tr>
        </tbody>
      </table>
    </div>
  );
}

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let d: CandidateDetail | null;
  try {
    d = await getCandidate(id);
    if (d) await markReviewed(id);
  } catch (e) {
    return <ErrorBox title="Could not load this candidate" message={errorMessage(e)} retryHref={`/candidates/${id}`} />;
  }
  if (!d) notFound();
  const { candidate: c, pii } = d;
  const applied = c.applied_role;
  const scoredWithOld = d.rubric.scoredWith && d.rubric.scoredWith.id !== d.rubric.current.id;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Link href={`/?role=${applied}`} className="text-xs text-neutral-500 hover:underline">← {applied} dashboard</Link>
          <h1 className="mt-1">{pii?.name ?? "(name needed)"}</h1>
          <p className="text-sm text-neutral-600">{c.headline ?? "–"} · applied for <b>{ROLE_LABEL[applied]}</b></p>
          <p className="mt-1 text-xs text-neutral-500">
            {pii?.email ?? "no email found"} · {pii?.phone ?? "no phone found"}
            {pii?.links?.length ? ` · ${pii.links.join(" · ")}` : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {c.stage !== "needs_name" && (c.status === "error" || c.stage !== "drafted") && <RetryButton id={c.id} />}
          {c.stage !== "needs_name" && c.status !== "processing" && <RetryButton id={c.id} rescore label="Re-score" />}
          <DeleteButton id={c.id} />
        </div>
      </div>

      {c.status === "error" && <ErrorBox title="The last step failed" message={c.error ?? "Unknown error"} />}
      {(c.stage === "needs_name" || !pii?.name_confident) && (
        <NameForm id={c.id} current={pii?.name ?? ""} required={c.stage === "needs_name"} />
      )}
      {scoredWithOld && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Scored with rubric {d.rubric.scoredWith!.label}; the current rubric is {d.rubric.current.label}. Press Re-score.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <RoleSummary d={d} role={applied} />
        <RoleSummary d={d} role={otherRole(applied)} />
      </div>

      {d.brief && !d.brief.hidden && (
        <div className="card border-blue-300 bg-blue-50">
          <h2>Interview brief</h2>
          <p className="mt-1 text-sm leading-relaxed">{d.brief.text}</p>
          <p className="mt-1 text-xs text-neutral-500">Generated {fmt(d.brief.generated_at)}{d.brief.used_jd ? " · used the JD for role context" : ""}</p>
        </div>
      )}
      {d.brief?.hidden && (
        <details className="text-sm text-neutral-600">
          <summary className="cursor-pointer">Brief hidden (they are no longer in the top 5)</summary>
          <p className="mt-1">{d.brief.text}</p>
        </details>
      )}

      <CriteriaTable d={d} role={applied} />
      <CriteriaTable d={d} role={otherRole(applied)} />

      {c.stage !== "needs_name" && (
        <EmailPanel
          id={c.id}
          email={d.email}
          recommendedKind={d.recommendedKind}
          kindLabels={EMAIL_KIND_LABEL}
          appliedRole={applied}
          ranked={!!d.roles[applied].total}
        />
      )}

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">Show what the AI saw (redacted CV text)</summary>
        <p className="mt-2 text-xs text-neutral-500">
          This is the only CV text ever sent to Gemini. Name, email, phone, links and personal-detail lines were removed in code before any AI call.
        </p>
        <pre className="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs">{c.cv_content}</pre>
      </details>

      <div>
        <h2>History</h2>
        <p className="text-xs text-neutral-500">Rubric: {d.rubric.scoredWith?.label ?? "not scored yet"}</p>
        <ul className="mt-2 space-y-1 text-sm">
          {d.events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-40 shrink-0 text-xs text-neutral-500">{fmt(e.at)}</span>
              <span>
                {ACTION_LABEL[e.action] ?? e.action}
                {Object.keys(e.detail ?? {}).length > 0 && (
                  <span className="ml-2 text-xs text-neutral-500">
                    {Object.entries(e.detail).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
