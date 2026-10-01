import { ErrorBox, errorMessage } from "@/components/ErrorBox";
import { MIN_SCORE, ROLES, ROLE_LABEL, SHORTLIST_SIZE } from "@/lib/constants";
import { getRubricPage } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RubricPage() {
  let data: Awaited<ReturnType<typeof getRubricPage>>;
  try {
    data = await getRubricPage();
  } catch (e) {
    return <ErrorBox title="Could not load the rubric" message={errorMessage(e)} retryHref="/rubric" />;
  }
  const { active, criteria, versions, counts, jds } = data;
  if (!active) {
    return <ErrorBox title="No rubric loaded" message="Run `npm run seed:rubric` (it reads rubric.txt, or rubric.draft.txt if rubric.txt is missing)." retryHref="/rubric" />;
  }
  return (
    <div className="space-y-5">
      <div>
        <h1>Rubric {active.label}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Read-only. Source: <code>{active.source_file}</code> · built from Kargo&apos;s 8 past hires, not the job descriptions.
          Scale 0–{active.max_score} per criterion; total = sum of (score ÷ {active.max_score} × weight), computed in code.
          {active.spm_requires_pm_strong && " An SPM score above 0 requires the PM criterion to be Strong (enforced in code)."}
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          The line: top {SHORTLIST_SIZE} per role <b>and</b> total ≥ {MIN_SCORE}. Ties: highest-weighted criterion first.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {ROLES.map((role) => {
          const rc = criteria.filter((c) => c.role === role);
          return (
            <div key={role} className="card">
              <h2>{ROLE_LABEL[role]} · weights sum to {rc.reduce((s, c) => s + Number(c.weight), 0)}%</h2>
              {active.role_notes?.[role] && <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-600">{active.role_notes[role]}</p>}
              <ol className="mt-3 space-y-2">
                {rc.map((c) => (
                  <li key={c.id}>
                    <details>
                      <summary className="cursor-pointer text-sm">
                        <b>{c.sort_order}. {c.name}</b> <span className="text-neutral-600">({Number(c.weight)}%)</span>
                      </summary>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-neutral-50 p-2 font-sans text-xs">{c.description}</pre>
                    </details>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">Shared scoring rules (sent with every scoring call)</summary>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-xs">{active.scoring_rules}</pre>
      </details>

      <div className="card">
        <h2>Versions and which one scored each candidate</h2>
        <table className="mt-2 text-sm">
          <thead className="text-left text-xs text-neutral-500"><tr><th className="pr-6">Version</th><th className="pr-6">File</th><th className="pr-6">Loaded</th><th>Candidates scored</th></tr></thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td className="pr-6">{v.label} {v.is_active && <span className="chip bg-green-100 text-green-800">active</span>}</td>
                <td className="pr-6"><code>{v.source_file}</code> <span className="text-xs text-neutral-400">{v.content_hash.slice(0, 8)}</span></td>
                <td className="pr-6">{new Date(v.created_at).toLocaleDateString("en-IN")}</td>
                <td>{counts.get(v.id) ?? 0}</td>
              </tr>
            ))}
            {(counts.get("none") ?? 0) > 0 && <tr><td className="pr-6 text-neutral-500">not scored yet</td><td /><td /><td>{counts.get("none")}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Job descriptions</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Used only to describe the role in briefs and emails, never for scoring.{" "}
          {jds.length === 0
            ? "None loaded yet: briefs and emails describe the roles generically. Add files to jds/ and run `npm run seed:jds && npm run redraft`."
            : jds.map((j) => `${j.role}: ${j.source_file} (${new Date(j.updated_at).toLocaleDateString("en-IN")})`).join(" · ")}
        </p>
      </div>
    </div>
  );
}
