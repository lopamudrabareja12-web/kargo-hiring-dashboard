/** A small in-memory stand-in for the Supabase query builder, enough for the pipeline tests. */
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const DEFAULTS: Record<string, () => Row> = {
  rubric_versions: () => ({ id: randomUUID(), is_active: false, role_notes: {}, scoring_rules: "", spm_requires_pm_strong: false, created_at: new Date().toISOString() }),
  rubric_criteria: () => ({ id: randomUUID() }),
  candidates: () => ({ id: randomUUID(), status: "processing", stage: "extracted", error: null, headline: null, rubric_version_id: null, reviewed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  candidate_pii: () => ({ links: [], name_confident: false }),
  scores: () => ({ id: randomUUID(), capped: false, evidence: "", evidence_verified: false }),
  role_totals: () => ({ in_top5: false, above_line: false, band: "below", tied_count: 0, tiebreak_note: null, cross_role_fit: false }),
  briefs: () => ({ hidden: false, used_jd: false, generated_at: new Date().toISOString() }),
  emails: () => ({ edited: false, outdated: false, used_jd: false, override_kind: null, confirmed_at: null, sent_at: null, sent_to: null, resend_id: null, final_subject: null, final_body: null, send_error: null }),
  events: () => ({ at: new Date().toISOString(), detail: {} }),
  role_context: () => ({}),
};
const UNIQUE: Record<string, string[][]> = {
  candidates: [["content_hash"]],
  candidate_pii: [["candidate_id"]],
  scores: [["candidate_id", "role", "criterion_id"]],
  role_totals: [["candidate_id", "role"]],
  briefs: [["candidate_id", "role"]],
  emails: [["candidate_id"]],
  rubric_versions: [["content_hash"]],
};
const CASCADE = ["candidate_pii", "scores", "role_totals", "briefs", "emails", "events"];

export class FakeDb {
  tables: Record<string, Row[]> = {};
  seq = 1;
  t(name: string) {
    return (this.tables[name] ??= []);
  }
  from(table: string) {
    return new Query(this, table);
  }
}

class Query {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private filters: Filter[] = [];
  private payload: Row | Row[] | null = null;
  private conflict: string[] = [];
  private returning = false;
  private head = false;
  private countMode = false;
  private orderBy: { col: string; asc: boolean } | null = null;
  private lim: number | null = null;
  private mode: "one" | "maybe" | null = null;

  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.head = !!opts?.head;
      this.countMode = !!opts?.count;
    } else this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = "insert"; this.payload = rows; return this; }
  update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert"; this.payload = rows; this.conflict = (opts?.onConflict ?? "id").split(","); return this;
  }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: null) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c: string, op: string, v: unknown) {
    if (op === "is") this.filters.push((r) => (r[c] ?? null) !== v);
    else if (op === "in") {
      const list = String(v).replace(/[()]/g, "").split(",");
      this.filters.push((r) => !list.includes(String(r[c])));
    }
    return this;
  }
  or(expr: string) {
    const parts = expr.split(",").map((p) => {
      const [col, op, ...rest] = p.split(".");
      const val = rest.join(".");
      return (r: Row) => (op === "is" ? (r[col] ?? null) === null : op === "lt" ? r[col] != null && String(r[col]) < val : false);
    });
    this.filters.push((r) => parts.some((f) => f(r)));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) { this.orderBy = { col, asc: opts?.ascending !== false }; return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "one"; return this; }

  then<A, B>(ok?: ((v: { data: unknown; error: { message: string; code?: string } | null; count?: number | null }) => A) | null, bad?: ((e: unknown) => B) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }

  private match(): Row[] {
    return this.db.t(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private violates(row: Row, ignore?: Row): boolean {
    return (UNIQUE[this.table] ?? []).some((cols) =>
      this.db.t(this.table).some((r) => r !== ignore && cols.every((c) => r[c] === row[c])),
    );
  }

  private run() {
    const tbl = this.db.t(this.table);
    let out: Row[] = [];
    if (this.op === "select") {
      out = this.match();
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
      }
      if (this.lim !== null) out = out.slice(0, this.lim);
      if (this.head) return { data: null, error: null, count: out.length };
    } else if (this.op === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((p) => ({
        ...(DEFAULTS[this.table]?.() ?? {}), ...(this.table === "events" ? { id: this.db.seq++ } : {}), ...p,
      }));
      for (const r of rows) {
        if (this.violates(r)) return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        tbl.push(r);
      }
      out = rows;
    } else if (this.op === "upsert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload!];
      for (const p of rows) {
        const existing = tbl.find((r) => this.conflict.every((c) => r[c] === p[c]));
        if (existing) Object.assign(existing, p);
        else tbl.push({ ...(DEFAULTS[this.table]?.() ?? {}), ...p });
        out.push(existing ?? tbl[tbl.length - 1]);
      }
    } else if (this.op === "update") {
      out = this.match();
      for (const r of out) Object.assign(r, this.payload);
    } else if (this.op === "delete") {
      out = this.match();
      this.db.tables[this.table] = tbl.filter((r) => !out.includes(r));
      if (this.table === "candidates") {
        const ids = out.map((r) => r.id);
        for (const t of CASCADE) this.db.tables[t] = this.db.t(t).filter((r) => !ids.includes(r.candidate_id));
      }
    }
    const data = out.map((r) => ({ ...r }));
    if (this.mode === "maybe") return { data: data[0] ?? null, error: null };
    if (this.mode === "one") {
      return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: `expected 1 row, got ${data.length}` } };
    }
    return { data: this.op === "select" || this.returning ? data : null, error: null, count: this.countMode ? data.length : null };
  }
}

