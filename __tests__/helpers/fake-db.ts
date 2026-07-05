/**
 * Filter-aware in-memory Supabase mock.
 *
 * Unlike `mock-supabase.ts` (which returns fixed data regardless of filters),
 * this fake actually applies `.eq()/.neq()/.gte()/...` against seeded rows —
 * which is what makes multi-tenant isolation testable: a query scoped to
 * restaurant A genuinely cannot see restaurant B's rows.
 *
 * Supported: select / insert / update / upsert / delete, eq, neq, gt, gte,
 * lt, lte, in, is, order, limit, single, maybeSingle, awaiting the builder
 * directly, unique-constraint simulation (error code 23505) and an onInsert
 * hook (used to simulate the Postgres loyalty trigger).
 */

type Row = Record<string, unknown>;
type Filter = { col: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is'; val: unknown };

export type FakeDbOptions = {
  /** Per-table unique column sets — violating insert returns { code: '23505' } */
  uniques?: Record<string, string[]>;
  /** Called after each successful insert (simulate DB triggers) */
  onInsert?: (table: string, row: Row, db: FakeDb) => void;
};

export class FakeDb {
  tables: Map<string, Row[]>;
  private opts: FakeDbOptions;

  constructor(seed: Record<string, Row[]>, opts: FakeDbOptions = {}) {
    this.tables = new Map(
      Object.entries(seed).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]),
    );
    this.opts = opts;
  }

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  from(table: string) {
    return new FakeQuery(this, table, this.opts);
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private filters: Filter[] = [];
  private orderBy: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private insertRows: Row[] = [];
  private updatePatch: Row = {};
  private wantRows = false; // .select() chained after a mutation

  constructor(private db: FakeDb, private table: string, private opts: FakeDbOptions) {}

  select(_cols?: string, _opts?: unknown) {
    if (this.op !== 'select') this.wantRows = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.insertRows = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows: Row | Row[], _opts?: unknown) { this.op = 'upsert'; this.insertRows = Array.isArray(rows) ? rows : [rows]; return this; }
  update(patch: Row) { this.op = 'update'; this.updatePatch = patch; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(col: string, val: unknown)  { this.filters.push({ col, op: 'eq',  val }); return this; }
  neq(col: string, val: unknown) { this.filters.push({ col, op: 'neq', val }); return this; }
  gt(col: string, val: unknown)  { this.filters.push({ col, op: 'gt',  val }); return this; }
  gte(col: string, val: unknown) { this.filters.push({ col, op: 'gte', val }); return this; }
  lt(col: string, val: unknown)  { this.filters.push({ col, op: 'lt',  val }); return this; }
  lte(col: string, val: unknown) { this.filters.push({ col, op: 'lte', val }); return this; }
  in(col: string, val: unknown[]) { this.filters.push({ col, op: 'in', val }); return this; }
  is(col: string, val: unknown)  { this.filters.push({ col, op: 'is', val }); return this; }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.limitN = to - from + 1; return this; }

  private matches(row: Row): boolean {
    return this.filters.every(({ col, op, val }) => {
      const v = row[col];
      switch (op) {
        case 'eq':  return v === val;
        case 'neq': return v !== val;
        case 'gt':  return (v as never) >  (val as never);
        case 'gte': return (v as never) >= (val as never);
        case 'lt':  return (v as never) <  (val as never);
        case 'lte': return (v as never) <= (val as never);
        case 'in':  return Array.isArray(val) && (val as unknown[]).includes(v);
        case 'is':  return v === val;
      }
    });
  }

  private run(): { data: unknown; error: { code: string; message: string } | null } {
    const all = this.db.rows(this.table);

    if (this.op === 'insert' || this.op === 'upsert') {
      const uniqueCols = this.opts.uniques?.[this.table] ?? [];
      const inserted: Row[] = [];
      for (const raw of this.insertRows) {
        const row: Row = { id: `${this.table}-${all.length + inserted.length + 1}`, ...raw };
        for (const col of uniqueCols) {
          const val = row[col];
          if (val != null && all.some((r) => r[col] === val)) {
            return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint (${this.table}.${col})` } };
          }
        }
        inserted.push(row);
      }
      all.push(...inserted);
      for (const row of inserted) this.opts.onInsert?.(this.table, row, this.db);
      return { data: inserted, error: null };
    }

    if (this.op === 'update') {
      const matched = all.filter((r) => this.matches(r));
      for (const r of matched) Object.assign(r, this.updatePatch);
      return { data: matched, error: null };
    }

    if (this.op === 'delete') {
      const remaining = all.filter((r) => !this.matches(r));
      const deleted = all.length - remaining.length;
      this.db.tables.set(this.table, remaining);
      return { data: new Array(deleted).fill(null), error: null };
    }

    // select
    let rows = all.filter((r) => this.matches(r)).map((r) => ({ ...r }));
    if (this.orderBy) {
      const { col, ascending } = this.orderBy;
      rows = rows.sort((a, b) => {
        const x = a[col] as never, y = b[col] as never;
        return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return { data: rows, error: null };
  }

  async single(): Promise<{ data: Row | null; error: { code: string; message: string } | null }> {
    const { data, error } = this.run();
    if (error) return { data: null, error };
    const rows = data as Row[];
    if (rows.length !== 1) {
      return { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${rows.length}` } };
    }
    return { data: rows[0], error: null };
  }

  async maybeSingle(): Promise<{ data: Row | null; error: { code: string; message: string } | null }> {
    const { data, error } = this.run();
    if (error) return { data: null, error };
    const rows = data as Row[];
    return { data: rows[0] ?? null, error: null };
  }

  // Awaiting the builder directly (no .single()) resolves like PostgREST list
  then<T1 = { data: unknown; error: unknown }, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function createFakeDb(seed: Record<string, Row[]>, opts?: FakeDbOptions) {
  return new FakeDb(seed, opts);
}

/**
 * Simulates the loyalty Postgres trigger chain
 * (001_scan_persistence_trigger + 002_stamps_completion + 031_per_pass_counters):
 * a transactions insert updates customer- and pass-level counters.
 */
export function applyLoyaltyTrigger(table: string, row: Row, db: FakeDb) {
  if (table !== 'transactions') return;

  const pointsDelta = (row.points_delta as number) ?? 0;
  const stampsDelta = (row.stamps_delta as number) ?? 0;

  const customer = db.rows('customers').find((c) => c.id === row.customer_id);
  if (customer) {
    customer.total_points = ((customer.total_points as number) ?? 0) + pointsDelta;
    if (stampsDelta < 0) {
      // negative delta = card reset (reward redeemed) → completed_cards++
      customer.stamps_count = 0;
      customer.completed_cards = ((customer.completed_cards as number) ?? 0) + 1;
    } else {
      customer.stamps_count = ((customer.stamps_count as number) ?? 0) + stampsDelta;
    }
  }

  if (row.wallet_pass_id) {
    const pass = db.rows('wallet_passes').find((p) => p.id === row.wallet_pass_id);
    if (pass) {
      pass.total_points = ((pass.total_points as number) ?? 0) + pointsDelta;
      pass.stamps_count = stampsDelta < 0 ? 0 : ((pass.stamps_count as number) ?? 0) + stampsDelta;
    }
  }
}
