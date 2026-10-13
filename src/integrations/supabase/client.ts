/**
 * عميل البيانات المحلي (بديل Supabase في النسخة الأوفلاين).
 *
 * يحتفظ هذا الملف بنفس اسم/واجهة عميل Supabase القديم عمداً، حتى تعمل كل
 * صفحات النظام كما هي دون تعديل، لكن كل عملية (from / rpc / auth / storage)
 * تُنفَّذ محلياً على قاعدة البيانات المجلدية (src/utils/folderDB.ts)
 * والمستخدمين المحليين (src/utils/localAuth.ts) — لا يُرسل أي بايت إلى
 * الإنترنت أبداً.
 *
 * النوع المعلن هو عميل Supabase الحقيقي (استيراد نوعي فقط، لا يُحمَّل وقت
 * التشغيل) حتى تبقى كل أنواع الصفوف المولّدة في ./types صالحة كما هي.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import {
  folderDB,
  primaryKeyOf,
  saveMediaFile,
  deleteMediaFile,
  mediaFileUrl,
  type DbRow,
} from "@/utils/folderDB";
import {
  createLocalUser,
  verifyLocalCredentials,
  getLocalUserById,
  updateLocalUser,
  deleteLocalUser,
  listLocalUsers,
  saveLocalSession,
  clearLocalSession,
  readLocalSessionUserId,
  type LocalUser,
} from "@/utils/localAuth";

// ===================== أدوات عامة =====================

type AnyRow = DbRow;

const nowISO = () => new Date().toISOString();

const err = (message: string, code = "LOCAL") => ({ message, code, details: null, hint: null });

const looseEq = (a: unknown, b: unknown): boolean => {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  return String(a) === String(b);
};

const compare = (a: unknown, b: unknown): number => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== "" && String(b).trim() !== "")
    return na - nb;
  return String(a).localeCompare(String(b), "ar");
};

// ===================== باني الاستعلامات المحلي =====================

interface Filter {
  col: string;
  op: string;
  val: unknown;
}

const RELATION_FK: Record<string, string[]> = {
  teacher_portals: ["portal_id", "teacher_portal_id"],
  profiles: ["owner_id", "grantee_id", "user_id", "profile_id"],
  students: ["student_id"],
  training_courses: ["course_id"],
  trainees: ["trainee_id"],
  teachers: ["teacher_id"],
};

interface EmbedSpec {
  key: string;
  relation: string;
  hint: string | null;
  cols: string[];
}

const parseSelect = (cols: string): { scalars: string[] | "*"; embeds: EmbedSpec[] } => {
  const trimmed = (cols || "*").trim();
  if (trimmed === "*") return { scalars: "*", embeds: [] };
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of trimmed) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current);

  const scalars: string[] = [];
  const embeds: EmbedSpec[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    const paren = part.indexOf("(");
    if (paren === -1) {
      if (part && part !== "*") scalars.push(part);
      continue;
    }
    const head = part.slice(0, paren).trim();
    const inner = part.slice(paren + 1, part.lastIndexOf(")"));
    let key = head;
    let relation = head;
    let hint: string | null = null;
    if (head.includes(":")) {
      const [alias, rest] = head.split(":");
      key = alias.trim();
      relation = rest.trim();
    }
    if (relation.includes("!")) {
      const [rel, h] = relation.split("!");
      relation = rel.trim();
      hint = h.trim();
    }
    embeds.push({
      key,
      relation,
      hint,
      cols: inner
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    });
  }
  return { scalars: scalars.length ? scalars : "*", embeds };
};

class LocalQueryBuilder {
  private table: string;
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: AnyRow | AnyRow[] | null = null;
  private onConflict: string | undefined;
  private filters: Filter[] = [];
  private orders: { col: string; ascending: boolean }[] = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private selectCols = "*";
  private countExact = false;
  private headOnly = false;
  private wantSingle = false;
  private wantMaybeSingle = false;
  private returning = false;

  constructor(table: string) {
    this.table = table;
  }

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    this.selectCols = cols;
    if (opts?.count === "exact") this.countExact = true;
    if (opts?.head) this.headOnly = true;
    if (this.mode !== "select") this.returning = true;
    return this;
  }

  insert(values: AnyRow | AnyRow[]) {
    this.mode = "insert";
    this.payload = values;
    return this;
  }

  upsert(values: AnyRow | AnyRow[], opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = values;
    this.onConflict = opts?.onConflict;
    return this;
  }

  update(values: AnyRow) {
    this.mode = "update";
    this.payload = values;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ col, op: "eq", val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ col, op: "neq", val });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ col, op: "gt", val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ col, op: "gte", val });
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push({ col, op: "lt", val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ col, op: "lte", val });
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push({ col, op: "in", val: vals });
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push({ col, op: "is", val });
    return this;
  }
  ilike(col: string, val: unknown) {
    this.filters.push({ col, op: "ilike", val });
    return this;
  }
  like(col: string, val: unknown) {
    this.filters.push({ col, op: "like", val });
    return this;
  }
  or(expr: string) {
    this.filters.push({ col: "__or", op: "or", val: expr });
    return this;
  }
  not(col: string, op: string, val: unknown) {
    this.filters.push({ col, op: `not:${op}`, val });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, ascending: opts?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this.execute();
  }
  maybeSingle() {
    this.wantMaybeSingle = true;
    return this.execute();
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private matches(row: AnyRow): boolean {
    for (const f of this.filters) {
      if (f.op === "or") {
        // صيغة مبسطة: "col.eq.val,col2.eq.val" — تحقق أن أحدها يطابق
        const branches = String(f.val).split(/,(?=[a-zA-Z_]+=|[^,]*\.)/);
        const any = branches.some((b) => {
          const m = b.trim().match(/^([a-zA-Z0-9_]+)\.eq\.(.+)$/);
          return m ? looseEq(row[m[1]], m[2]) : false;
        });
        if (!any) return false;
        continue;
      }
      const v = row[f.col];
      switch (f.op) {
        case "eq":
          if (!looseEq(v, f.val)) return false;
          break;
        case "neq":
          if (looseEq(v, f.val)) return false;
          break;
        case "gt":
          if (!(compare(v, f.val) > 0)) return false;
          break;
        case "gte":
          if (!(compare(v, f.val) >= 0)) return false;
          break;
        case "lt":
          if (!(compare(v, f.val) < 0)) return false;
          break;
        case "lte":
          if (!(compare(v, f.val) <= 0)) return false;
          break;
        case "in":
          if (!(f.val as unknown[]).some((x) => looseEq(v, x))) return false;
          break;
        case "is":
          if (!((v ?? null) === (f.val ?? null))) return false;
          break;
        case "ilike":
        case "like": {
          const pattern = String(f.val).replace(/%/g, "").toLowerCase();
          if (
            !String(v ?? "")
              .toLowerCase()
              .includes(pattern)
          )
            return false;
          break;
        }
        default:
          if (f.op.startsWith("not:")) {
            const inner = f.op.slice(4);
            if (inner === "eq" && looseEq(v, f.val)) return false;
            if (inner === "is" && (v ?? null) === (f.val ?? null)) return false;
          }
      }
    }
    return true;
  }

  private async project(rows: AnyRow[]): Promise<AnyRow[]> {
    const { scalars, embeds } = parseSelect(this.selectCols);
    const embedData = new Map<string, AnyRow[]>();
    for (const e of embeds) embedData.set(e.key, await folderDB.getAll(e.relation));

    return rows.map((row) => {
      const out: AnyRow = {};
      if (scalars === "*") Object.assign(out, row);
      else for (const c of scalars) out[c] = row[c] ?? null;
      for (const e of embeds) {
        const fkCandidates = [...(RELATION_FK[e.relation] ?? [])];
        if (e.hint) {
          const m = e.hint.match(/_(.+)_fkey$/);
          if (m) fkCandidates.unshift(m[1]);
        }
        fkCandidates.push(`${e.relation.replace(/s$/, "")}_id`);
        const fk = fkCandidates.find((c) => row[c] != null);
        const target = fk
          ? (embedData.get(e.key) ?? []).find((r) => looseEq(r.id, row[fk]))
          : undefined;
        if (!target) out[e.key] = null;
        else {
          const picked: AnyRow = {};
          for (const c of e.cols) picked[c] = target[c] ?? null;
          out[e.key] = picked;
        }
      }
      return out;
    });
  }

  private async execute(): Promise<{ data: unknown; error: unknown; count?: number | null }> {
    try {
      if (this.mode === "insert" || this.mode === "upsert") {
        const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).filter(
          Boolean,
        ) as AnyRow[];
        const prepared: AnyRow[] = [];
        let rowsExisting = await folderDB.getAll(this.table);
        for (const item of items) {
          const row: AnyRow = { ...item };
          if (row.id == null && primaryKeyOf(this.table)[0] === "id") {
            if (this.table === "students") {
              const maxId = rowsExisting.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
              row.id = maxId + 1;
              rowsExisting = [...rowsExisting, row];
            }
          }
          if (row.created_at == null && this.table !== "hifz_history" && this.table !== "year_data")
            row.created_at = nowISO();
          if (
            row.updated_at == null &&
            this.table !== "hifz_history" &&
            this.table !== "year_data" &&
            this.table !== "user_settings"
          )
            row.updated_at = row.created_at;
          prepared.push(row);
        }
        const saved = await folderDB.upsert(this.table, prepared, this.onConflict);
        if (!this.returning && !this.wantSingle && !this.wantMaybeSingle)
          return { data: null, error: null };
        const projected = await this.project(saved);
        if (this.wantSingle)
          return {
            data: projected[0] ?? null,
            error: projected[0] ? null : err("لم يُحفظ الصف", "PGRST116"),
          };
        if (this.wantMaybeSingle) return { data: projected[0] ?? null, error: null };
        return { data: projected, error: null };
      }

      if (this.mode === "update") {
        const patch = { ...(this.payload as AnyRow) };
        const changed = await folderDB.updateWhere(this.table, patch, (r) => this.matches(r));
        if (!this.returning && !this.wantSingle && !this.wantMaybeSingle)
          return { data: null, error: null };
        const projected = await this.project(changed);
        if (this.wantSingle)
          return changed.length
            ? { data: projected[0], error: null }
            : { data: null, error: err("الصف غير موجود", "PGRST116") };
        if (this.wantMaybeSingle) return { data: projected[0] ?? null, error: null };
        return { data: projected, error: null };
      }

      if (this.mode === "delete") {
        await folderDB.deleteWhere(this.table, (r) => this.matches(r));
        return { data: null, error: null };
      }

      // select
      let rows = (await folderDB.getAll(this.table)).filter((r) => this.matches(r));
      const count = rows.length;
      for (let i = this.orders.length - 1; i >= 0; i--) {
        const { col, ascending } = this.orders[i];
        rows = [...rows].sort((a, b) => compare(a[col], b[col]) * (ascending ? 1 : -1));
      }
      if (this.rangeFrom != null)
        rows = rows.slice(this.rangeFrom, (this.rangeTo ?? rows.length) + 1);
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      if (this.headOnly) return { data: null, error: null, count: this.countExact ? count : null };

      const projected = await this.project(rows);
      if (this.wantSingle) {
        return projected.length === 1
          ? { data: projected[0], error: null, count: this.countExact ? count : undefined }
          : { data: null, error: err("الصف غير موجود أو أكثر من صف", "PGRST116") };
      }
      if (this.wantMaybeSingle) return { data: projected[0] ?? null, error: null };
      return { data: projected, error: null, count: this.countExact ? count : undefined };
    } catch (e) {
      return { data: null, error: err(e instanceof Error ? e.message : "خطأ محلي غير متوقع") };
    }
  }
}

// ===================== المستخدم/الجلسة بشكل Supabase =====================

interface ShimUser {
  id: string;
  email: string;
  user_metadata: { display_name: string | null };
  app_metadata: Record<string, unknown>;
  aud: string;
  role: string;
  created_at: string;
}

const toShimUser = (u: LocalUser): ShimUser => ({
  id: u.id,
  email: u.email,
  user_metadata: { display_name: u.display_name },
  app_metadata: { provider: "local" },
  aud: "authenticated",
  role: "authenticated",
  created_at: u.created_at,
});

const toSession = (u: LocalUser) => ({
  access_token: `local-${u.id}`,
  refresh_token: `local-${u.id}`,
  token_type: "bearer",
  expires_in: 60 * 60 * 24 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  user: toShimUser(u),
});

type AuthListener = (event: string, session: ReturnType<typeof toSession> | null) => void;
const authListeners = new Set<AuthListener>();

const currentLocalUser = async (): Promise<LocalUser | null> => {
  const id = readLocalSessionUserId();
  if (!id) return null;
  const user = await getLocalUserById(id);
  if (!user) clearLocalSession();
  return user;
};

const emitAuth = (event: string, user: LocalUser | null) => {
  const session = user ? toSession(user) : null;
  authListeners.forEach((fn) => {
    try {
      fn(event, session);
    } catch {
      /* تجاهل */
    }
  });
};

const auth = {
  async getSession() {
    const user = await currentLocalUser();
    return { data: { session: user ? toSession(user) : null }, error: null };
  },
  async getUser() {
    const user = await currentLocalUser();
    return { data: { user: user ? toShimUser(user) : null }, error: null };
  },
  onAuthStateChange(callback: AuthListener) {
    authListeners.add(callback);
    void currentLocalUser().then((user) => {
      try {
        callback("INITIAL_SESSION", user ? toSession(user) : null);
      } catch {
        /* تجاهل */
      }
    });
    return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } };
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const user = await verifyLocalCredentials(email, password);
    if (!user)
      return {
        data: { user: null, session: null },
        error: err(
          "بيانات الدخول غير صحيحة — تحقق من اسم الدخول وكلمة المرور",
          "invalid_credentials",
        ),
      };
    saveLocalSession(user.id);
    emitAuth("SIGNED_IN", user);
    return { data: { user: toShimUser(user), session: toSession(user) }, error: null };
  },
  async signUp(input: {
    email: string;
    password: string;
    options?: { data?: { display_name?: string } };
  }) {
    try {
      const user = await createLocalUser({
        email: input.email,
        password: input.password,
        displayName: input.options?.data?.display_name,
      });
      saveLocalSession(user.id);
      emitAuth("SIGNED_IN", user);
      return { data: { user: toShimUser(user), session: toSession(user) }, error: null };
    } catch (e) {
      return {
        data: { user: null, session: null },
        error: err(e instanceof Error ? e.message : "تعذّر إنشاء الحساب"),
      };
    }
  },
  async updateUser(input: { password?: string; data?: { display_name?: string } }) {
    const user = await currentLocalUser();
    if (!user) return { data: { user: null }, error: err("لا توجد جلسة مستخدم") };
    try {
      await updateLocalUser(user.id, {
        display_name: input.data?.display_name,
        newPassword: input.password,
      });
      const fresh = await getLocalUserById(user.id);
      if (fresh) emitAuth("USER_UPDATED", fresh);
      return { data: { user: fresh ? toShimUser(fresh) : null }, error: null };
    } catch (e) {
      return { data: { user: null }, error: err(e instanceof Error ? e.message : "تعذّر التحديث") };
    }
  },
  async resetPasswordForEmail() {
    return {
      data: {},
      error: err(
        "لا توجد رسائل بريد في النسخة الأوفلاين — اطلب من مسؤول الجهاز إعادة تعيين كلمة مرورك من صفحة إدارة المستخدمين",
      ),
    };
  },
  async signOut() {
    clearLocalSession();
    emitAuth("SIGNED_OUT", null);
    return { error: null };
  },
};

// ===================== دوال RPC المحلية =====================

const rpc = async (
  fn: string,
  args: Record<string, unknown> = {},
): Promise<{ data: unknown; error: unknown }> => {
  try {
    const me = await currentLocalUser();

    if (fn === "is_admin") return { data: !!me?.is_admin, error: null };

    if (fn === "admin_list_users") {
      if (!me?.is_admin) return { data: null, error: err("للمسؤول فقط") };
      const users = await listLocalUsers();
      const students = await folderDB.getAll("students");
      const grants = await folderDB.getAll("data_access_grants");
      return {
        data: users.map((u) => {
          const grant = grants.find((g) => g.owner_id === me.id && g.grantee_id === u.id);
          return {
            id: u.id,
            email: u.email,
            display_name: u.display_name,
            created_at: u.created_at,
            is_admin: u.is_admin,
            students_count: students.filter((s) => s.user_id === u.id).length,
            granted: !!grant,
            access_level: (grant?.access_level as string) ?? null,
          };
        }),
        error: null,
      };
    }

    if (fn === "admin_set_role") {
      if (!me?.is_admin) return { data: null, error: err("للمسؤول فقط") };
      await updateLocalUser(String(args._user_id), { is_admin: !!args._make_admin });
      return { data: null, error: null };
    }

    if (fn === "admin_delete_user") {
      if (!me?.is_admin) return { data: null, error: err("للمسؤول فقط") };
      const targetId = String(args._user_id);
      const tables = [
        "students",
        "hifz_history",
        "year_data",
        "teachers",
        "teacher_bonuses",
        "donors",
        "awards",
        "ceremony_expenses",
        "certificates",
        "media",
        "monthly_tracking",
        "monthly_submissions",
        "teacher_portals",
        "student_competitions",
        "exam_questions",
        "trainees",
        "training_courses",
        "training_enrollments",
        "user_settings",
      ];
      for (const t of tables) await folderDB.deleteWhere(t, (r) => r.user_id === targetId);
      await deleteLocalUser(targetId);
      return { data: null, error: null };
    }

    if (fn === "open_teacher_portal") {
      const code = String(args.p_code || "");
      const portals = await folderDB.getAll("teacher_portals");
      const portal = portals.find((p) => p.code === code && p.active !== false);
      if (!portal) return { data: [], error: null };
      const students = await folderDB.getAll("students");
      const yearData = await folderDB.getAll("year_data");
      const tracking = await folderDB.getAll("monthly_tracking");
      const submissions = await folderDB.getAll("monthly_submissions");
      const yearStudents = students
        .filter(
          (s) =>
            s.user_id === portal.user_id &&
            yearData.some((y) => String(y.student_id) === String(s.id) && y.year === portal.year),
        )
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
      const data = yearStudents.map((s) => {
        const prev = tracking.find(
          (t) =>
            String(t.student_id) === String(s.id) &&
            t.year === portal.year &&
            Number(t.month) === Number(portal.month) - 1,
        );
        const sub = submissions.find(
          (x) => x.portal_id === portal.id && String(x.student_id) === String(s.id),
        );
        return {
          code: portal.code,
          teacher_name: portal.teacher_name,
          year: portal.year,
          month: portal.month,
          student_id: s.id,
          student_name: s.name,
          prev_memo_surah: (prev?.memorization_to_surah as number) ?? null,
          prev_memo_ayah: (prev?.memorization_to_ayah as number) ?? null,
          prev_review_surah: (prev?.review_to_surah as number) ?? null,
          prev_review_ayah: (prev?.review_to_ayah as number) ?? null,
          submission: sub
            ? {
                status: sub.status,
                memorization_from_surah: sub.memorization_from_surah,
                memorization_from_ayah: sub.memorization_from_ayah,
                memorization_to_surah: sub.memorization_to_surah,
                memorization_to_ayah: sub.memorization_to_ayah,
                memorization_hifz_score: sub.memorization_hifz_score,
                memorization_recitation_score: sub.memorization_recitation_score,
                review_from_surah: sub.review_from_surah,
                review_from_ayah: sub.review_from_ayah,
                review_to_surah: sub.review_to_surah,
                review_to_ayah: sub.review_to_ayah,
                review_hifz_score: sub.review_hifz_score,
                review_recitation_score: sub.review_recitation_score,
                attendance_score: sub.attendance_score,
                behavior_score: sub.behavior_score,
                notes: sub.notes,
                submitted_at: sub.updated_at,
              }
            : null,
        };
      });
      return { data, error: null };
    }

    if (fn === "submit_teacher_monthly") {
      const portals = await folderDB.getAll("teacher_portals");
      const portal = portals.find((p) => p.code === String(args.p_code || ""));
      if (!portal) return { data: null, error: err("الرابط غير صالح") };
      if (portal.active === false) return { data: null, error: err("تم إيقاف هذا الرابط") };
      if (
        String(portal.year) !== String(args.p_year) ||
        Number(portal.month) !== Number(args.p_month)
      )
        return { data: null, error: err("الرابط لا يطابق العام أو الشهر المحدد") };
      const students = await folderDB.getAll("students");
      if (
        !students.some(
          (s) => String(s.id) === String(args.p_student_id) && s.user_id === portal.user_id,
        )
      )
        return { data: null, error: err("الطالب/ة غير موجود في قائمتك") };

      const existing = (await folderDB.getAll("monthly_submissions")).find(
        (x) => x.portal_id === portal.id && String(x.student_id) === String(args.p_student_id),
      );
      const row: AnyRow = {
        id: existing?.id,
        user_id: portal.user_id,
        portal_id: portal.id,
        code: portal.code,
        student_id: args.p_student_id,
        student_name: args.p_student_name,
        year: args.p_year,
        month: args.p_month,
        memorization_from_surah: args.p_memorization_from_surah ?? null,
        memorization_from_ayah: args.p_memorization_from_ayah ?? null,
        memorization_to_surah: args.p_memorization_to_surah ?? null,
        memorization_to_ayah: args.p_memorization_to_ayah ?? null,
        memorization_hifz_score: args.p_memorization_hifz_score ?? 0,
        memorization_recitation_score: args.p_memorization_recitation_score ?? 0,
        review_from_surah: args.p_review_from_surah ?? null,
        review_from_ayah: args.p_review_from_ayah ?? null,
        review_to_surah: args.p_review_to_surah ?? null,
        review_to_ayah: args.p_review_to_ayah ?? null,
        review_hifz_score: args.p_review_hifz_score ?? 0,
        review_recitation_score: args.p_review_recitation_score ?? 0,
        attendance_score: args.p_attendance_score ?? 0,
        behavior_score: args.p_behavior_score ?? 0,
        notes: args.p_notes ?? null,
        status: "pending",
        source: "portal",
        teacher_name: portal.teacher_name,
        review_note: null,
        reviewed_at: null,
        created_at: existing?.created_at ?? nowISO(),
        updated_at: nowISO(),
      };
      const [saved] = await folderDB.upsert("monthly_submissions", row);
      return { data: saved, error: null };
    }

    return { data: null, error: err(`دالة محلية غير معروفة: ${fn}`) };
  } catch (e) {
    return { data: null, error: err(e instanceof Error ? e.message : "خطأ محلي") };
  }
};

// ===================== تخزين الوسائط (مجلد الملفات) =====================

const storage = {
  from(_bucket: string) {
    return {
      async upload(path: string, file: File | Blob) {
        try {
          await saveMediaFile(path, file);
          return { data: { path }, error: null };
        } catch (e) {
          return { data: null, error: err(e instanceof Error ? e.message : "فشل حفظ الملف") };
        }
      },
      async remove(paths: string[]) {
        for (const p of paths) await deleteMediaFile(p);
        return { data: [], error: null };
      },
      async createSignedUrls(paths: string[]) {
        const data: { signedUrl: string; path: string; error: null }[] = [];
        for (const p of paths)
          data.push({ signedUrl: await mediaFileUrl(p), path: p, error: null });
        return { data, error: null };
      },
      async createSignedUrl(path: string) {
        return { data: { signedUrl: await mediaFileUrl(path) }, error: null };
      },
    };
  },
};

// ===================== العميل =====================

const localClient = {
  from: (table: string) => new LocalQueryBuilder(table),
  rpc,
  auth,
  storage,
};

export const supabase = localClient as unknown as SupabaseClient<Database>;
