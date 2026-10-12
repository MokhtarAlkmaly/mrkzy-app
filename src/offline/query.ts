/**
 * منشئ استعلامات متوافق مع واجهة supabase-js (PostgREST) لكنه يعمل محلياً
 * فوق قاعدة بيانات المجلد. هكذا تبقى كل شاشات التطبيق المكتوبة أصلاً لـ
 * Supabase تعمل بلا تعديل تقريباً — لكن بدون إنترنت.
 *
 * المدعوم: select (أعمدة، أسماء مستعارة، تضمين علاقات مثل students(name) و
 * portal:teacher_portals(teacher_name)، count/head)، insert، update، upsert
 * (onConflict/ignoreDuplicates)، delete (مع الحذف المتسلسل)، والمرشحات
 * eq/neq/gt/gte/lt/lte/like/ilike/is/in/match/not/or/filter، وorder وlimit
 * وrange وsingle وmaybeSingle وthrowOnError.
 */

import { cloneRow, DbError, type FolderDb } from "./folderDb";
import { getTableDef, hasTable, type Row } from "./schema";

export interface LocalPostgrestError {
  message: string;
  code: string;
  details: string | null;
  hint: string | null;
}

export interface LocalResponse<T = unknown> {
  data: T | null;
  error: LocalPostgrestError | null;
  count: number | null;
  status: number;
  statusText: string;
}

type Filter = (row: Row) => boolean;

// ============================================================
// مقارنة القيم (تقليد سلوك PostgreSQL قدر الإمكان)
// ============================================================

export const valuesEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    return !Number.isNaN(na) && !Number.isNaN(nb) && na === nb;
  }
  if (typeof a === "boolean" || typeof b === "boolean") return String(a) === String(b);
  if (typeof a === "object" || typeof b === "object")
    return JSON.stringify(a) === JSON.stringify(b);
  return String(a) === String(b);
};

export const compareValues = (a: unknown, b: unknown): number => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  }
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  const sa = typeof a === "object" ? JSON.stringify(a) : String(a);
  const sb = typeof b === "object" ? JSON.stringify(b) : String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
};

const isNullish = (v: unknown) => v === null || v === undefined;

const likeToRegex = (pattern: string, caseInsensitive: boolean): RegExp => {
  let re = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) {
      re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (ch === "%") re += "[\\s\\S]*";
    else if (ch === "_") re += "[\\s\\S]";
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${re}$`, caseInsensitive ? "iu" : "u");
};

/** يحوّل قيمة نصية من صيغة PostgREST (في or/filter) إلى قيمة. */
const parseFilterValue = (raw: string): unknown => {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
};

const makeFilter = (column: string, op: string, value: unknown): Filter => {
  switch (op) {
    case "eq":
      return (r) => valuesEqual(r[column], value);
    case "neq":
      return (r) => !isNullish(r[column]) && !valuesEqual(r[column], value);
    case "gt":
      return (r) => !isNullish(r[column]) && compareValues(r[column], value) > 0;
    case "gte":
      return (r) => !isNullish(r[column]) && compareValues(r[column], value) >= 0;
    case "lt":
      return (r) => !isNullish(r[column]) && compareValues(r[column], value) < 0;
    case "lte":
      return (r) => !isNullish(r[column]) && compareValues(r[column], value) <= 0;
    case "like": {
      const re = likeToRegex(String(value), false);
      return (r) => !isNullish(r[column]) && re.test(String(r[column]));
    }
    case "ilike": {
      const re = likeToRegex(String(value), true);
      return (r) => !isNullish(r[column]) && re.test(String(r[column]));
    }
    case "is":
      if (value === null || value === "null") return (r) => isNullish(r[column]);
      return (r) => r[column] === value || String(r[column]) === String(value);
    case "in": {
      const list = Array.isArray(value)
        ? value
        : String(value)
            .replace(/^\(|\)$/g, "")
            .split(",")
            .map((s) => parseFilterValue(s.trim().replace(/^"|"$/g, "")));
      return (r) => list.some((v) => valuesEqual(r[column], v));
    }
    case "cs": {
      // contains: للمصفوفات/الكائنات
      return (r) => {
        const cell = r[column];
        if (Array.isArray(cell) && Array.isArray(value)) {
          return value.every((v) => cell.some((c) => valuesEqual(c, v)));
        }
        if (cell && typeof cell === "object" && value && typeof value === "object") {
          return Object.entries(value as Row).every(([k, v]) => valuesEqual((cell as Row)[k], v));
        }
        return false;
      };
    }
    default:
      throw new DbError("PGRST100", `مرشح غير مدعوم في النسخة المحلية: ${op}`);
  }
};

/** يحلل تعبير or من نوع "a.eq.1,b.ilike.%x%" إلى مرشح. */
const parseOrExpression = (expr: string): Filter => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of expr) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  if (current) parts.push(current);
  const filters = parts.map((part) => {
    const trimmed = part.trim();
    const m = /^([^.]+)\.(not\.)?([a-z]+)\.([\s\S]*)$/.exec(trimmed);
    if (!m) throw new DbError("PGRST100", `تعبير or غير مدعوم: ${trimmed}`);
    const [, col, not, op, raw] = m;
    const f = makeFilter(col, op, op === "in" ? raw : parseFilterValue(raw));
    return not ? (r: Row) => !f(r) : f;
  });
  return (r) => filters.some((f) => f(r));
};

// ============================================================
// تحليل نص select
// ============================================================

type SelectItem =
  | { kind: "star" }
  | { kind: "column"; name: string; alias: string }
  | { kind: "embed"; table: string; alias: string; items: SelectItem[] };

const splitTopLevel = (input: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
};

export const parseSelect = (input: string): SelectItem[] => {
  const text = (input || "*").replace(/\s+/g, " ").trim() || "*";
  return splitTopLevel(text).map((token): SelectItem => {
    if (token === "*") return { kind: "star" };
    let alias: string | null = null;
    let rest = token;
    // alias:column — مع تجاهل التحويل col::text
    const colonIdx = rest.search(/(?<!:):(?!:)/);
    const parenIdx = rest.indexOf("(");
    if (colonIdx > 0 && (parenIdx === -1 || colonIdx < parenIdx)) {
      alias = rest.slice(0, colonIdx).trim();
      rest = rest.slice(colonIdx + 1).trim();
    }
    const embed = /^([A-Za-z0-9_]+)(?:![A-Za-z0-9_]+)?(?:!inner|!left)?\s*\(([\s\S]*)\)$/.exec(
      rest,
    );
    if (embed) {
      const [, table, inner] = embed;
      return { kind: "embed", table, alias: alias || table, items: parseSelect(inner || "*") };
    }
    const name = rest.split("::")[0].trim();
    return { kind: "column", name, alias: alias || name };
  });
};

// ============================================================
// التضمين (العلاقات)
// ============================================================

type EmbedResolver = (row: Row) => unknown;

const makeEmbedResolver = (
  db: FolderDb,
  fromTable: string,
  item: Extract<SelectItem, { kind: "embed" }>,
): EmbedResolver => {
  if (!hasTable(item.table)) {
    throw new DbError(
      "PGRST200",
      `Could not find a relationship between '${fromTable}' and '${item.table}'`,
    );
  }
  const fromDef = getTableDef(fromTable);
  const targetDef = getTableDef(item.table);

  // علاقة متعدد-إلى-واحد: عمود في الجدول الحالي يشير إلى الجدول المضمّن.
  const manyToOne = (fromDef.foreignKeys ?? []).find((fk) => fk.table === item.table);
  if (manyToOne) {
    let index: Map<string, Row> | null = null;
    return (row) => {
      if (!index) {
        index = new Map();
        for (const target of db.rowsRef(item.table)) {
          index.set(String(target[manyToOne.refColumn]), target);
        }
      }
      const val = row[manyToOne.column];
      if (isNullish(val)) return null;
      const target = index.get(String(val));
      return target ? project(db, item.table, target, item.items) : null;
    };
  }

  // علاقة واحد-إلى-متعدد: الجدول المضمّن فيه عمود يشير إلى الجدول الحالي.
  const oneToMany = (targetDef.foreignKeys ?? []).find((fk) => fk.table === fromTable);
  if (oneToMany) {
    let groups: Map<string, Row[]> | null = null;
    return (row) => {
      if (!groups) {
        groups = new Map();
        for (const child of db.rowsRef(item.table)) {
          const key = String(child[oneToMany.column]);
          const list = groups.get(key) ?? [];
          list.push(child);
          groups.set(key, list);
        }
      }
      const list = groups.get(String(row[oneToMany.refColumn])) ?? [];
      return list.map((child) => project(db, item.table, child, item.items));
    };
  }

  throw new DbError(
    "PGRST200",
    `Could not find a relationship between '${fromTable}' and '${item.table}'`,
  );
};

const resolverCache = new WeakMap<SelectItem[], Map<string, EmbedResolver>>();

function project(db: FolderDb, table: string, row: Row, items: SelectItem[]): Row {
  let resolvers = resolverCache.get(items);
  if (!resolvers) {
    resolvers = new Map();
    resolverCache.set(items, resolvers);
  }
  const out: Row = {};
  for (const item of items) {
    if (item.kind === "star") {
      Object.assign(out, cloneRow(row));
    } else if (item.kind === "column") {
      const val = row[item.name];
      out[item.alias] =
        val === undefined
          ? null
          : typeof val === "object" && val !== null
            ? cloneRow({ v: val }).v
            : val;
    } else {
      let resolver = resolvers.get(item.alias);
      if (!resolver) {
        resolver = makeEmbedResolver(db, table, item);
        resolvers.set(item.alias, resolver);
      }
      out[item.alias] = resolver(row);
    }
  }
  return out;
}

// ============================================================
// منشئ الاستعلام
// ============================================================

type Operation = "select" | "insert" | "update" | "upsert" | "delete";

interface OrderSpec {
  column: string;
  ascending: boolean;
  nullsFirst: boolean;
}

export const toPostgrestError = (err: unknown): LocalPostgrestError => {
  if (err instanceof DbError) {
    return { message: err.message, code: err.code, details: err.details, hint: err.hint };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { message, code: "LOCAL_ERROR", details: null, hint: null };
};

export class LocalQueryBuilder implements PromiseLike<LocalResponse> {
  private readonly getDb: () => FolderDb;
  private readonly table: string;
  private op: Operation = "select";
  private selectText = "*";
  private returning = false;
  private filters: Filter[] = [];
  private orders: OrderSpec[] = [];
  private limitCount: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;
  private countMode: string | null = null;
  private headOnly = false;
  private values: Row[] = [];
  private patch: Row = {};
  private conflictColumns: string[] | null = null;
  private ignoreDuplicates = false;
  private shouldThrow = false;

  constructor(getDb: () => FolderDb, table: string) {
    this.getDb = getDb;
    this.table = table;
  }

  // ---------- العمليات ----------

  select(columns = "*", options: { count?: string | null; head?: boolean } = {}): this {
    this.selectText = columns || "*";
    if (this.op === "select") {
      this.countMode = options.count ?? null;
      this.headOnly = !!options.head;
    } else {
      this.returning = true;
    }
    return this;
  }

  insert(values: Row | Row[], options: { count?: string } = {}): this {
    this.op = "insert";
    this.values = Array.isArray(values) ? values : [values];
    this.countMode = options.count ?? null;
    return this;
  }

  upsert(
    values: Row | Row[],
    options: { onConflict?: string; ignoreDuplicates?: boolean; count?: string } = {},
  ): this {
    this.op = "upsert";
    this.values = Array.isArray(values) ? values : [values];
    this.conflictColumns = options.onConflict
      ? options.onConflict
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : null;
    this.ignoreDuplicates = !!options.ignoreDuplicates;
    this.countMode = options.count ?? null;
    return this;
  }

  update(values: Row, options: { count?: string } = {}): this {
    this.op = "update";
    this.patch = values;
    this.countMode = options.count ?? null;
    return this;
  }

  delete(options: { count?: string } = {}): this {
    this.op = "delete";
    this.countMode = options.count ?? null;
    return this;
  }

  // ---------- المرشحات ----------

  eq(column: string, value: unknown): this {
    this.filters.push(makeFilter(column, "eq", value));
    return this;
  }
  neq(column: string, value: unknown): this {
    this.filters.push(makeFilter(column, "neq", value));
    return this;
  }
  gt(column: string, value: unknown): this {
    this.filters.push(makeFilter(column, "gt", value));
    return this;
  }
  gte(column: string, value: unknown): this {
    this.filters.push(makeFilter(column, "gte", value));
    return this;
  }
  lt(column: string, value: unknown): this {
    this.filters.push(makeFilter(column, "lt", value));
    return this;
  }
  lte(column: string, value: unknown): this {
    this.filters.push(makeFilter(column, "lte", value));
    return this;
  }
  like(column: string, pattern: string): this {
    this.filters.push(makeFilter(column, "like", pattern));
    return this;
  }
  ilike(column: string, pattern: string): this {
    this.filters.push(makeFilter(column, "ilike", pattern));
    return this;
  }
  is(column: string, value: unknown): this {
    this.filters.push(makeFilter(column, "is", value));
    return this;
  }
  in(column: string, values: unknown[]): this {
    this.filters.push(makeFilter(column, "in", values));
    return this;
  }
  contains(column: string, value: unknown): this {
    this.filters.push(makeFilter(column, "cs", value));
    return this;
  }
  match(query: Row): this {
    for (const [col, val] of Object.entries(query)) this.eq(col, val);
    return this;
  }
  not(column: string, op: string, value: unknown): this {
    const f = makeFilter(column, op, value);
    this.filters.push((r) => !f(r));
    return this;
  }
  or(expression: string): this {
    this.filters.push(parseOrExpression(expression));
    return this;
  }
  filter(column: string, op: string, value: unknown): this {
    if (op.startsWith("not.")) return this.not(column, op.slice(4), value);
    this.filters.push(makeFilter(column, op, value));
    return this;
  }

  // ---------- الترتيب والتقسيم ----------

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}): this {
    const ascending = options.ascending ?? true;
    this.orders.push({ column, ascending, nullsFirst: options.nullsFirst ?? !ascending });
    return this;
  }
  limit(count: number): this {
    this.limitCount = count;
    return this;
  }
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  single(): this {
    this.singleMode = "single";
    return this;
  }
  maybeSingle(): this {
    this.singleMode = "maybeSingle";
    return this;
  }
  throwOnError(): this {
    this.shouldThrow = true;
    return this;
  }
  returns(): this {
    return this;
  }
  overrideTypes(): this {
    return this;
  }
  abortSignal(): this {
    return this;
  }

  // ---------- التنفيذ ----------

  private matches = (row: Row) => this.filters.every((f) => f(row));

  private sortRows(rows: Row[]): Row[] {
    if (this.orders.length === 0) return rows;
    return rows.slice().sort((a, b) => {
      for (const o of this.orders) {
        const va = a[o.column];
        const vb = b[o.column];
        const na = isNullish(va);
        const nb = isNullish(vb);
        if (na || nb) {
          if (na && nb) continue;
          return na === o.nullsFirst ? -1 : 1;
        }
        const cmp = compareValues(va, vb);
        if (cmp !== 0) return o.ascending ? cmp : -cmp;
      }
      return 0;
    });
  }

  private paginate(rows: Row[]): Row[] {
    let out = rows;
    if (this.rangeFrom !== null && this.rangeTo !== null) {
      out = out.slice(this.rangeFrom, this.rangeTo + 1);
    }
    if (this.limitCount !== null) out = out.slice(0, this.limitCount);
    return out;
  }

  private shape(rows: Row[]): unknown {
    const db = this.getDb();
    const items = parseSelect(this.selectText);
    const projected = rows.map((r) => project(db, this.table, r, items));
    if (this.singleMode === "single") {
      if (projected.length !== 1) {
        throw new DbError(
          "PGRST116",
          "JSON object requested, multiple (or no) rows returned",
          `The result contains ${projected.length} rows`,
        );
      }
      return projected[0];
    }
    if (this.singleMode === "maybeSingle") {
      if (projected.length > 1) {
        throw new DbError(
          "PGRST116",
          "JSON object requested, multiple (or no) rows returned",
          `The result contains ${projected.length} rows`,
        );
      }
      return projected[0] ?? null;
    }
    return projected;
  }

  private run(): { data: unknown; count: number | null } {
    const db = this.getDb();
    if (!hasTable(this.table)) {
      throw new DbError("42P01", `relation "public.${this.table}" does not exist`);
    }

    switch (this.op) {
      case "select": {
        const matched = db.rowsRef(this.table).filter(this.matches);
        const count = this.countMode ? matched.length : null;
        if (this.headOnly) return { data: null, count };
        return { data: this.shape(this.paginate(this.sortRows(matched))), count };
      }
      case "insert": {
        const inserted = db.insertRows(this.table, this.values);
        const count = this.countMode ? inserted.length : null;
        return { data: this.returning ? this.shape(inserted) : null, count };
      }
      case "upsert": {
        const rows = db.upsertRows(this.table, this.values, this.conflictColumns, {
          ignoreDuplicates: this.ignoreDuplicates,
        });
        const count = this.countMode ? rows.length : null;
        return { data: this.returning ? this.shape(rows) : null, count };
      }
      case "update": {
        const rows = db.updateRows(this.table, this.matches, this.patch);
        const count = this.countMode ? rows.length : null;
        return { data: this.returning ? this.shape(this.sortRows(rows)) : null, count };
      }
      case "delete": {
        const rows = db.deleteRows(this.table, this.matches);
        const count = this.countMode ? rows.length : null;
        return { data: this.returning ? this.shape(rows) : null, count };
      }
    }
  }

  async execute(): Promise<LocalResponse> {
    try {
      const { data, count } = this.run();
      const status =
        this.op === "insert" ? 201 : this.op === "select" || this.returning ? 200 : 204;
      return { data, error: null, count, status, statusText: "OK" };
    } catch (err) {
      const error = toPostgrestError(err);
      if (this.shouldThrow) throw error;
      return { data: null, error, count: null, status: 400, statusText: "Bad Request" };
    }
  }

  then<TResult1 = LocalResponse, TResult2 = never>(
    onfulfilled?: ((value: LocalResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<LocalResponse | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<LocalResponse> {
    return this.execute().finally(onfinally);
  }
}
