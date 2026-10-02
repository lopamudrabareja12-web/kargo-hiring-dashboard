import type { Metadata } from "next";
import { ErrorBox, errorMessage } from "@/components/ErrorBox";
import { Icon } from "@/components/Icons";
import { MIN_SCORE, ROLES, ROLE_LABEL, SHORTLIST_SIZE } from "@/lib/constants";
import { getRubricPage } from "@/lib/queries";

export const metadata: Metadata = { title: "Rubric" };
export const dynamic = "force-dynamic";

const delay = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default async function RubricPage() {
  let data: Awaited<ReturnType<typeof getRubricPage>>;
  try {
    data = await getRubricPage();
  } catch (e) {
    return <ErrorBox title="Couldn't load the rubric" message={errorMessage(e)} retryHref="/rubric" />;
  }
  const { active, criteria, versions, counts, jds } = data;
  if (!active) {
    return <ErrorBox title="No rubric loaded" message="Run `npm run seed:rubric` (it reads rubric.txt, or rubric.draft.txt if rubric.txt is missing)." retryHref="/rubric" />;
  }
  return (
    <div className="space-y-12">
      <header className="reveal max-w-2xl">
        <span className="eyebrow-pill">The scoring standard · read-only</span>
        <h1 className="mt-4">What a great Kargo PM looks like</h1>
        <p className="mt-3 text-muted">
          Rubric {active.label}, built from the patterns in your 8 past hires. It was never built from the job descriptions.
          Each criterion is scored 0 to {active.max_score}, and the total is sum of (score ÷ {active.max_score} × weight), computed in code.
          {active.spm_requires_pm_strong && " An SPM score above 0 needs the PM criterion to be Strong, enforced in code."}
        </p>
        <p className="mt-2 text-sm text-muted">
          The line: top {SHORTLIST_SIZE} per role <b className="text-ink">and</b> a total of at least {MIN_SCORE}. Ties go to the highest-weighted criterion.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {ROLES.map((role, n) => {
          const rc = criteria.filter((c) => c.role === role);
          return (
            <section key={role} className="card reveal" style={delay(n + 1)} aria-labelledby={`role-${role}`}>
              <h2 id={`role-${role}`}>{ROLE_LABEL[role]}</h2>
              <p className="mt-1 text-xs text-muted">{rc.length} criteria · weights sum to {rc.reduce((s, c) => s + Number(c.weight), 0)}% · open one to read the full test</p>
              {active.role_notes?.[role] && <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted">{active.role_notes[role]}</p>}
              <ol className="mt-5 space-y-1">
                {rc.map((c) => (
                  <li key={c.id}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors duration-300 hover:bg-cream">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf-50 text-xs font-bold text-leaf-700">{c.sort_order}</span>
                        <span className="flex-1 text-sm font-semibold">{c.name}</span>
                        <span className="h-2 w-20 rounded-full bg-sand" aria-hidden="true"><span className="block h-2 rounded-full bg-leaf-500" style={{ width: `${Number(c.weight) * 2.5}%` }} /></span>
                        <span className="w-10 text-right text-sm font-semibold">{Number(c.weight)}%</span>
                      </summary>
                      <pre className="mb-2 mt-1 whitespace-pre-wrap rounded-2xl bg-cream p-5 font-sans text-xs leading-relaxed">{c.description}</pre>
                    </details>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">Shared scoring rules, sent with every scoring call</summary>
        <pre className="mt-4 whitespace-pre-wrap font-sans text-xs leading-relaxed">{active.scoring_rules}</pre>
      </details>

      <section className="card" aria-labelledby="versions">
        <h2 id="versions">Versions, and which one scored each candidate</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="pb-2 pr-6 font-medium">Version</th><th className="pb-2 pr-6 font-medium">File</th><th className="pb-2 pr-6 font-medium">Loaded</th><th className="pb-2 font-medium">Candidates scored</th></tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-t border-line/60">
                  <td className="py-2.5 pr-6">{v.label} {v.is_active && <span className="chip ml-1 bg-leaf-100 text-leaf-800">active</span>}</td>
                  <td className="py-2.5 pr-6"><code>{v.source_file}</code> <span className="text-xs text-muted">{v.content_hash.slice(0, 8)}</span></td>
                  <td className="py-2.5 pr-6">{new Date(v.created_at).toLocaleDateString("en-IN")}</td>
                  <td className="py-2.5">{counts.get(v.id) ?? 0}</td>
                </tr>
              ))}
              {(counts.get("none") ?? 0) > 0 && <tr className="border-t border-line/60"><td className="py-2.5 pr-6 text-muted">Not scored yet</td><td /><td /><td className="py-2.5">{counts.get("none")}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card flex items-start gap-4" aria-labelledby="jds">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sand text-muted"><Icon name="file" size={20} /></span>
        <div>
          <h2 id="jds">Job descriptions</h2>
          <p className="mt-1.5 text-sm text-muted">
            Used only to describe the role in briefs and emails, never for scoring.{" "}
            {jds.length === 0
              ? "None loaded yet, so briefs and emails describe the roles generically. Add files to jds/ and run `npm run seed:jds && npm run redraft`."
              : jds.map((j) => `${j.role}: ${j.source_file} (${new Date(j.updated_at).toLocaleDateString("en-IN")})`).join(" · ")}
          </p>
        </div>
      </section>
    </div>
  );
}
