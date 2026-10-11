/**
 * اختبارات قواعد البيانات (Postgres) — تُشغَّل محلياً عبر @electric-sql/pglite
 * (نسخة Postgres كاملة داخل الذاكرة) دون الحاجة إلى Supabase حقيقي.
 *
 * ما يفعله:
 *   1) يحاكي البيئة التي تفترضها الترحيلات: مخطط auth (users + auth.uid())
 *      ومخطط storage (objects + foldername) والأدوار anon/authenticated/
 *      service_role — تماماً كما في Supabase.
 *   2) يشغّل كل ملفات supabase/migrations بالترتيب (قوالب $، السلاسل،
 *      والتعليقات محترمة عند تقسيم العبارات).
 *   3) يختبر: بنية الجداول والفهارس، صلاحيات RLS لكل دور، الدالتين
 *      العامتين (open_teacher_portal / submit_teacher_monthly) بجميع
 *      حالات الخطأ، إعادة الإرسال، CASCADE، المقيّدات، وتحديث updated_at.
 *
 * التشغيل: npm run test:sql
 */

import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

// ============================================================
// تقسيم ملف SQL إلى عبارات (يحترم $$...$$ و '...' و -- و /* */)
// ============================================================

function splitStatements(sql) {
  const stmts = [];
  let cur = "";
  let i = 0;
  let n = sql.length;
  let dollarTag = null;
  while (i < n) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        cur += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    if (ch === "'") {
      // سلسلة أحادية (مع '' المزدوجة)
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (two === "--") {
      let j = sql.indexOf("\n", i);
      if (j === -1) j = n;
      cur += sql.slice(i, j);
      i = j;
      continue;
    }
    if (two === "/*") {
      let j = sql.indexOf("*/", i + 2);
      j = j === -1 ? n : j + 2;
      cur += sql.slice(i, j);
      i = j;
      continue;
    }
    // فتح اقتباس دوлари (مثل $$ أو $body$)
    const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
    if (m) {
      dollarTag = m[0];
      cur += dollarTag;
      i += dollarTag.length;
      continue;
    }
    if (ch === ";") {
      const s = cur.trim();
      if (s) stmts.push(s);
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  const s = cur.trim();
  if (s) stmts.push(s);
  return stmts;
}

// ============================================================
// إعداد قاعدة البيانات + تشغيل الترحيلات
// ============================================================

/** يحاكي بيئة Supabase (auth/storage/الأدوار) على أي قاعدة PGlite. */
async function applyStubs(db) {
  // --- محاكاة مخطط auth (كما في Supabase) ---
  await db.query("CREATE SCHEMA IF NOT EXISTS auth");
  // الأعمدة كما في Supabase الحقيقي — created_at لازم لتحديد «أول حساب» (المسؤول).
  await db.query(
    `CREATE TABLE IF NOT EXISTS auth.users (
       id uuid PRIMARY KEY,
       email text,
       raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  await db.query(
    "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid\nLANGUAGE sql STABLE\nAS $$\n  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid\n$$",
  );

  // --- محاكاة مخطط storage (الوسائط) ---
  await db.query("CREATE SCHEMA IF NOT EXISTS storage");
  await db.query(
    `CREATE TABLE IF NOT EXISTS storage.buckets (
       id text PRIMARY KEY,
       name text,
       owner uuid,
       public boolean DEFAULT true,
       created_at timestamptz,
       updated_at timestamptz,
       file_size_limit bigint,
       allowed_mime_types text[]
     )`,
  );
  await db.query(
    "CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY, bucket_id text, name text, owner uuid)",
  );
  await db.query(
    "CREATE OR REPLACE FUNCTION storage.foldername(p_name text) RETURNS text[]\nLANGUAGE sql IMMUTABLE\nAS $$\n  SELECT string_to_array(p_name, '/')\n$$",
  );

  // --- الأدوار القياسية في Supabase ---
  await db.query("CREATE ROLE anon NOLOGIN");
  await db.query("CREATE ROLE authenticated NOLOGIN");
  // service_role يتجاوز RLS تماماً (بصلاحية BYPASSRLS كما في Supabase)
  await db.query("CREATE ROLE service_role NOLOGIN BYPASSRLS");
  await db.query("GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role");
  await db.query("GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role");

  // في Supabase الحقيقي تُمنح الصلاحيات على جداول public تلقائياً لكل من
  // anon/authenticated/service_role (وRLS هي التي تقيّد الوصول فعلياً).
  // PGlite لا تملك هذا الافتراضي، فنحاكيه بصلاحيات افتراضية تُطبَّق على كل
  // جدول/تسلسل/دالة تُنشئها الترحيلات بعدها.
  await db.query(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role",
  );
  await db.query(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role",
  );
  await db.query(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role",
  );
}

/** قاعدة جديدة + محاكاة Supabase + تشغيل كل الترحيلات بالترتيب. */
async function setupDb() {
  const db = new PGlite();
  await applyStubs(db);
  const dir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = await readFile(join(dir, f), "utf8");
    for (const stmt of splitStatements(sql)) {
      try {
        await db.query(stmt);
      } catch (err) {
        throw new Error(`فشل الترحيل ${f} عند: ${stmt.slice(0, 80)}…\n${err.message}`);
      }
    }
  }
  return { db, files };
}

// ============================================================
// أدوات مساعدة للاختبار
// ============================================================

let db;

const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

/** تنفيذ كدور معين (مع الاستعادة). الأدوار NOLOGIN تعمل عبر SET ROLE من root. */
async function asRole(role, fn) {
  await db.query(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.query("RESET ROLE");
  }
}

/** تنفيذ كالمستخدم userId (auth.uid() = userId) عبر الدور authenticated. */
async function asUser(userId, fn) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
  try {
    return await asRole("authenticated", fn);
  } finally {
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  }
}

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed++;
  console.log(`  ✓ ${passed}) ${label}`);
}

async function throws(fn, label, msgPart) {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    if (msgPart) {
      assert.ok(
        String(err.message || err).includes(msgPart),
        `${label} — لم تعثر على «${msgPart}» في: ${String(err.message || err).slice(0, 120)}`,
      );
    }
  }
  assert.ok(threw, label);
  passed++;
  console.log(`  ✓ ${passed}) ${label}`);
}

// ============================================================
// البيانات التجريبية
// ============================================================

// USER_ROOT يُنشأ أولاً فيصبح «المسؤول التلقائي» (أول حساب في المشروع)،
// حتى يبقى USER_A و USER_B مستخدمين عاديين فتختبر الصلاحيات بشكل واقعي.
const USER_ROOT = "00000000-0000-0000-0000-000000000000";
const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000002";
const YEAR = "1447";

async function seed() {
  // مستخدمون (تريغر on_auth_user_created ينشئ profile ودوراً تلقائياً كما في Supabase).
  // created_at صريح حتى يكون «أول حساب» محدداً بلا لبس.
  const mkUser = (id, email, daysAgo) =>
    db.query(
      `INSERT INTO auth.users (id, email, created_at)
       VALUES ($1, $2, now() - ($3 || ' day')::interval)`,
      [id, email, String(daysAgo)],
    );
  await mkUser(USER_ROOT, "root@test.dev", 3);
  await mkUser(USER_A, "a@test.dev", 2);
  await mkUser(USER_B, "b@test.dev", 1);

  // طالبات: A عند الطالبات 1 و2 و3 (الأخيرة بلا تسجيل للعام)
  //            B عند الطالبة 4
  const mkStudent = async (userId, name) =>
    (
      await one("INSERT INTO public.students (user_id, name) VALUES ($1, $2) RETURNING id", [
        userId,
        name,
      ])
    ).id;
  const s1 = await mkStudent(USER_A, "فاطمة");
  const s2 = await mkStudent(USER_A, "عائشة");
  const s3 = await mkStudent(USER_A, "مريم");
  const s4 = await mkStudent(USER_B, "خديجة");

  // تسجيل في العام (year_data) — بدون مريم (لاختبار استبعادها)
  for (const sid of [s1, s2, s4]) {
    const owner = sid === s4 ? USER_B : USER_A;
    await db.query("INSERT INTO public.year_data (user_id, student_id, year) VALUES ($1, $2, $3)", [
      owner,
      sid,
      YEAR,
    ]);
  }

  // متابعة الشهر السابق (الشهر 1) — نقطة "بدء من نهاية الشهر السابق"
  const prev = async (userId, sid, memoSurah, memoAyah, revSurah, revAyah) =>
    db.query(
      `INSERT INTO public.monthly_tracking
         (user_id, student_id, year, month,
          memorization_to_surah, memorization_to_ayah,
          review_to_surah, review_to_ayah)
       VALUES ($1, $2, $3, 1, $4, $5, $6, $7)`,
      [userId, sid, YEAR, memoSurah, memoAyah, revSurah, revAyah],
    );
  await prev(USER_A, s1, 1, 5, 1, 1);
  await prev(USER_A, s2, 2, 3, 1, 2);
  await prev(USER_B, s4, 3, 4, 2, 2);

  // روابط المعلمات (أُنشئت كالمالك عبر الدور authenticated)
  const mkPortal = async (userId, name, code, year, month, active = true) => {
    await asUser(userId, () =>
      db.query(
        `INSERT INTO public.teacher_portals (user_id, teacher_name, code, year, month, active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, name, code, year, month, active],
      ),
    );
    return (await one("SELECT id FROM public.teacher_portals WHERE code = $1", [code])).id;
  };
  const portalA = await mkPortal(USER_A, "أم محمد", "TESTCODEA", YEAR, 2);
  const portalOff = await mkPortal(USER_A, "أم خالد", "TESTOFFIC", YEAR, 3, false);
  const portalB = await mkPortal(USER_B, "أم سعد", "TESTCODEB", YEAR, 2);

  return { s1, s2, s3, s4, portalA, portalOff, portalB };
}

// ============================================================
// الاختبارات
// ============================================================

async function main() {
  console.log("🧪 اختبار ملفات SQL عبر PGlite…\n");
  const t0 = Date.now();
  const { db: pgdb, files } = await setupDb();
  db = pgdb;
  console.log(`  شُغّلت ${files.length} ملفات ترحيل بنجاح.\n`);

  // ---------- البنية ----------
  console.log("البنية والفهارس:");
  const tables = await q(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename IN ('teacher_portals', 'monthly_submissions')`,
  );
  ok(tables.length === 2, "جدولا teacher_portals و monthly_submissions موجودان");

  const rlson = await q(
    `SELECT relname, relrowsecurity FROM pg_class
      WHERE relname IN ('teacher_portals', 'monthly_submissions')`,
  );
  ok(rlson.length === 2 && rlson.every((r) => r.relrowsecurity), "RLS مفعّل على الجدولين");

  const idx = await q(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
      AND indexname IN ('teacher_portals_code_key', 'monthly_submissions_portal_student_key')`,
  );
  ok(idx.length === 2, "الفهرسان الفرديان (كود الرابط، بوابة+طالبة) موجودان");

  const fns = await q(
    `SELECT p.proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('open_teacher_portal', 'submit_teacher_monthly')`,
  );
  ok(fns.length === 2, "الدالتان العامتان موجودتان");

  const src = await one("SELECT prosrc FROM pg_proc WHERE proname = 'submit_teacher_monthly'");
  ok(
    src.prosrc.includes("pg_notify") && src.prosrc.includes("'pgst'"),
    "submit_teacher_monthly يُخطّر عبر pg_notify على قناة pgst",
  );

  // ---------- البيانات ----------
  const { s1, s2, s3, s4, portalA, portalOff, portalB } = await seed();

  // ---------- RLS: teacher_portals ----------
  console.log("\nصلاحيات RLS — teacher_portals:");
  await throws(
    () =>
      asRole("anon", () =>
        db.query(
          `INSERT INTO public.teacher_portals (user_id, teacher_name, code, year, month)
           VALUES ($1, 'هاكر', 'HACKCODE', $2, 1)`,
          [USER_A, YEAR],
        ),
      ),
    "anon لا يستطيع إنشاء روابط",
  );

  const anonVisible = await asRole("anon", () => q("SELECT code FROM public.teacher_portals"));
  ok(anonVisible.length === 2, "anon يرى الروابط النشطة فقط (2)");
  ok(
    anonVisible.some((r) => r.code === "TESTCODEA") &&
      anonVisible.some((r) => r.code === "TESTCODEB") &&
      !anonVisible.some((r) => r.code === "TESTOFFIC"),
    "anon لا يرى الرابط الموقوف",
  );

  const aPortals = await asUser(USER_A, () => q("SELECT id FROM public.teacher_portals"));
  ok(aPortals.length === 2, "المالك A يرى روابطه (2)");

  const bPortals = await asUser(USER_B, () => q("SELECT id FROM public.teacher_portals"));
  ok(bPortals.length === 1, "المالك B لا يرى روابط A");

  await asUser(USER_A, () =>
    db.query(
      `INSERT INTO public.teacher_portals (user_id, teacher_name, code, year, month)
       VALUES ($1, 'أم رية', 'TESTEXTRA', $2, 4)`,
      [USER_A, YEAR],
    ),
  );
  const aAfter = await asUser(USER_A, () => q("SELECT id FROM public.teacher_portals"));
  ok(aAfter.length === 3, "المالك A يستطيع إنشاء رابط له");

  await throws(
    () =>
      asUser(USER_A, () =>
        db.query(
          `INSERT INTO public.teacher_portals (user_id, teacher_name, code, year, month)
           VALUES ($1, 'مخترق', 'STEALCODE', $2, 5)`,
          [USER_B, YEAR],
        ),
      ),
    "A لا يستطيع إنشاء رابط باسم مستخدم آخر",
  );

  await asUser(USER_A, () =>
    db.query(
      `UPDATE public.teacher_portals SET teacher_name = 'أم محمد 2' WHERE code = 'TESTCODEA'`,
    ),
  );
  const renamed = await one(
    "SELECT teacher_name FROM public.teacher_portals WHERE code = 'TESTCODEA'",
  );
  ok(renamed.teacher_name === "أم محمد 2", "المالك يستطيع تعديل رابطه");

  const updRes = await asUser(USER_B, () =>
    db.query(`UPDATE public.teacher_portals SET teacher_name = 'خبيث' WHERE code = 'TESTCODEA'`),
  );
  ok(updRes.affectedRows === 0, "A لا يستطيع تعديل رابط B (صفّات = 0)");

  await asUser(USER_A, () =>
    db.query(`DELETE FROM public.teacher_portals WHERE code = 'TESTEXTRA'`),
  );
  const extraGone = await q("SELECT id FROM public.teacher_portals WHERE code = 'TESTEXTRA'");
  ok(extraGone.length === 0, "المالك يستطيع حذف رابطه");

  const delRes = await asUser(USER_B, () =>
    db.query(`DELETE FROM public.teacher_portals WHERE code = 'TESTCODEA'`),
  );
  ok(delRes.affectedRows === 0, "B لا يستطيع حذف رابط A (صفّات = 0)");

  // ---------- الدالة open_teacher_portal (anon) ----------
  console.log("\nدالة open_teacher_portal (بدون تسجيل دخول):");
  const view = await asRole("anon", () =>
    q(`SELECT * FROM public.open_teacher_portal('TESTCODEA')`),
  );
  ok(view.length === 2, "البوابة تعيد طالباتها المسجلات بالعام فقط (2، بلا مريم)");
  const fathema = view.find((r) => r.student_id === s1);
  ok(
    fathema && fathema.prev_memo_surah === 1 && fathema.prev_memo_ayah === 5,
    "نقطة نهاية الشهر السابق (الحفظ) تصل للمعلمة",
  );
  ok(
    fathema && fathema.prev_review_surah === 1 && fathema.prev_review_ayah === 1,
    "نقطة نهاية الشهر السابق (المراجعة) تصل للمعلمة",
  );
  ok(
    fathema.submission === null || fathema.submission === undefined,
    "لا ترسيل سابقاً → submission فارغة",
  );

  const invalidView = await asRole("anon", () =>
    q(`SELECT * FROM public.open_teacher_portal('NOPE')`),
  );
  ok(invalidView.length === 0, "كود غير موجود → لا شيء");

  const offView = await asRole("anon", () =>
    q(`SELECT * FROM public.open_teacher_portal('TESTOFFIC')`),
  );
  ok(offView.length === 0, "رابط موقوف → لا شيء");

  const bView = await asRole("anon", () =>
    q(`SELECT * FROM public.open_teacher_portal('TESTCODEB')`),
  );
  ok(bView.length === 1 && bView[0].student_id === s4, "بوابة B تعيد طالبات B فقط");

  // ---------- الدالة submit_teacher_monthly (anon) ----------
  console.log("\nدالة submit_teacher_monthly (بدون تسجيل دخول):");
  const sub1 = await asRole("anon", () =>
    q(
      `SELECT * FROM public.submit_teacher_monthly(
        'TESTCODEA', $1, 'فاطمة', $2, 2,
        1, 6, 1, 12, 20, 10,
        1, 2, 1, 8, 15, 9, 8, 9, 'ممتازة')`,
      [s1, YEAR],
    ),
  );
  ok(sub1.length === 1, "ترسيل صالح → صف واحد يُعاد");
  ok(sub1[0].status === "pending", "الحالة الافتراضية قيد المراجعة");
  ok(sub1[0].user_id === USER_A, "الترسيل يُنسب لمالك البوابة (A)");
  ok(sub1[0].code === "TESTCODEA" && sub1[0].portal_id === portalA, "حُفظ الكود ومعرف البوابة");

  const sub2 = await asRole("anon", () =>
    q(
      `SELECT * FROM public.submit_teacher_monthly(
        'TESTCODEA', $1, 'عائشة', $2, 2,
        2, 4, 2, 10, 18, 7,
        1, 3, 2, 5, 20, 11, 9, 10, NULL)`,
      [s2, YEAR],
    ),
  );
  ok(sub2.length === 1, "الترسيل الثاني (عائشة) نجح");

  const sub4 = await asRole("anon", () =>
    q(
      `SELECT * FROM public.submit_teacher_monthly(
        'TESTCODEB', $1, 'خديجة', $2, 2,
        3, 5, 3, 11, 22, 12,
        2, 3, 3, 9, 19, 10, 7, 8, NULL)`,
      [s4, YEAR],
    ),
  );
  ok(sub4.length === 1, "بوابة B تستقبل ترسيلاً لطلابها");

  await throws(
    () =>
      asRole("anon", () =>
        db.query(`SELECT * FROM public.submit_teacher_monthly('NOPE', $1, 'س', $2, 2)`, [s1, YEAR]),
      ),
    "كود غير صالح → رسالة «الرابط غير صالح»",
    "الرابط غير صالح",
  );
  await throws(
    () =>
      asRole("anon", () =>
        db.query(`SELECT * FROM public.submit_teacher_monthly('TESTOFFIC', $1, 'س', $2, 3)`, [
          s1,
          YEAR,
        ]),
      ),
    "رابط موقوف → رسالة «تم إيقاف هذا الرابط»",
    "تم إيقاف هذا الرابط",
  );
  await throws(
    () =>
      asRole("anon", () =>
        db.query(`SELECT * FROM public.submit_teacher_monthly('TESTCODEA', $1, 'س', $2, 5)`, [
          s1,
          YEAR,
        ]),
      ),
    "شهر لا يطابق الرابط → رفض",
    "لا يطابق",
  );
  await throws(
    () =>
      asRole("anon", () =>
        db.query(`SELECT * FROM public.submit_teacher_monthly('TESTCODEA', $1, 'مخترقة', $2, 2)`, [
          s4,
          YEAR,
        ]),
      ),
    "طالب/ة لا يتبع المالك → رفض",
    "غير موجود في قائمتك",
  );

  // إعادة الإرسال تحدّث الصف نفسه
  const before = await one(
    "SELECT count(*)::int c FROM public.monthly_submissions WHERE portal_id = $1",
    [portalA],
  );
  const resub = await asRole("anon", () =>
    q(
      `SELECT * FROM public.submit_teacher_monthly(
        'TESTCODEA', $1, 'فاطمة', $2, 2,
        1, 6, 1, 15, 24, 14,
        1, 2, 1, 9, 21, 13, 9, 10, 'إعادة')`,
      [s1, YEAR],
    ),
  );
  const after = await one(
    "SELECT count(*)::int c FROM public.monthly_submissions WHERE portal_id = $1",
    [portalA],
  );
  ok(after.c === before.c, "إعادة الإرسال لا تكرر الصف");
  ok(resub[0].id === sub1[0].id, "إعادة الإرسال تحدّث الصف نفسه");
  ok(resub[0].memorization_to_ayah === 15, "البيانات الجديدة حُفظت");

  // ---------- RLS: monthly_submissions ----------
  console.log("\nصلاحيات RLS — monthly_submissions:");
  // ملاحظة: في Supabase يملك anon صلاحية الجدول افتراضياً، لكن RLS هي التي
  // تحجب الصفوف — فالقراءة تُعيد صفراً من الصفوف بدل أن ترمي خطأ.
  const anonSubs = await asRole("anon", () => q("SELECT * FROM public.monthly_submissions"));
  ok(anonSubs.length === 0, "anon لا يستطيع قراءة الترسيلات مباشرة (RLS: صفر صفوف)");

  const anonUpdate = await asRole("anon", () =>
    db.query(`UPDATE public.monthly_submissions SET status = 'approved' WHERE true`),
  );
  ok(anonUpdate.affectedRows === 0, "anon لا يستطيع تعديل الترسيلات مباشرة (صفّات = 0)");

  const aSubs = await asUser(USER_A, () => q("SELECT id FROM public.monthly_submissions"));
  ok(aSubs.length === 2, "المالك A يرى ترسيلاه");

  const bSubs = await asUser(USER_B, () => q("SELECT id FROM public.monthly_submissions"));
  ok(bSubs.length === 1, "B لا يرى ترسيلا A");

  await asUser(USER_A, () =>
    db.query(
      `UPDATE public.monthly_submissions SET status = 'approved', reviewed_at = now() WHERE id = $1`,
      [sub1[0].id],
    ),
  );
  const appr = await one("SELECT status FROM public.monthly_submissions WHERE id = $1", [
    sub1[0].id,
  ]);
  ok(appr.status === "approved", "المالك يستطيع اعتماد ترسيلا");

  const updB = await asUser(USER_A, () =>
    db.query(`UPDATE public.monthly_submissions SET status = 'pending' WHERE id = $1`, [
      sub4[0].id,
    ]),
  );
  ok(updB.affectedRows === 0, "A لا يستطيع تعديل ترسيل B (صفّات = 0)");

  // إعادة الإرسال بعد الرفض تعيد حالة المراجعة وتمسح ملاحظته
  await asUser(USER_A, () =>
    db.query(
      `UPDATE public.monthly_submissions
         SET status = 'rejected', review_note = 'أعيدي القسم'
       WHERE id = $1`,
      [sub2[0].id],
    ),
  );
  const resub2 = await asRole("anon", () =>
    q(
      `SELECT * FROM public.submit_teacher_monthly(
        'TESTCODEA', $1, 'عائشة', $2, 2,
        2, 4, 2, 11, 19, 8,
        1, 3, 2, 6, 20, 12, 9, 10, NULL)`,
      [s2, YEAR],
    ),
  );
  ok(resub2[0].status === "pending", "إعادة الإرسال بعد الرفض تعيد «قيد المراجعة»");
  ok(resub2[0].review_note === null, "إعادة الإرسال تمسح ملاحظة الرفض");

  // ---------- INSERT المباشر (سياسة RLS الخاصة بالـ anon) ----------
  console.log("\nسياسة «submit_teacher_monthly» للـ INSERT المباشر:");
  await throws(
    () =>
      asRole("anon", () =>
        db.query(
          `INSERT INTO public.monthly_submissions
             (user_id, portal_id, code, student_id, student_name, year, month)
           VALUES ($1, $2, 'WRONGCODE', $3, 'مخالفة', $4, 2)`,
          [USER_A, portalA, s3, YEAR],
        ),
      ),
    "INSERT مباشر بـ كود لا يطابق البوابة النشطة → مرفوض",
  );
  await asRole("anon", () =>
    db.query(
      `INSERT INTO public.monthly_submissions
         (user_id, portal_id, code, student_id, student_name, year, month)
       VALUES ($1, $2, 'TESTCODEA', $3, 'مريم (مباشرة)', $4, 2)`,
      [USER_A, portalA, s3, YEAR],
    ),
  );
  const direct = await one("SELECT id FROM public.monthly_submissions WHERE student_id = $1", [s3]);
  ok(!!direct, "INSERT مباشر يطابق البوابة النشطة → مسموح (سياسة anon)");

  // ---------- التقرير اليدوي (manual) ----------
  console.log("\nالتقرير اليدوي (إدخال المالك نيابة عن معلم/ة بلا رابط):");
  const manual = await asUser(USER_A, () =>
    q(
      `INSERT INTO public.monthly_submissions
         (user_id, portal_id, code, teacher_name, source, student_id, student_name,
          year, month, memorization_to_surah, memorization_to_ayah,
          memorization_hifz_score, attendance_score, status)
       VALUES ($1, NULL, NULL, 'أبو عبدالله', 'manual', $2, 'فاطمة', $3, 3, 2, 5, 22, 9, 'approved')
       RETURNING *`,
      [USER_A, s1, YEAR],
    ),
  );
  ok(
    manual.length === 1 && manual[0].source === "manual" && manual[0].portal_id === null,
    "إدخال يدوي يُحفظ بلا رابط ولا كود ومصدره manual",
  );
  ok(manual[0].teacher_name === "أبو عبدالله", "اسم المعلم/ة يُحفظ على الترسيل اليدوي");

  await throws(
    () =>
      asUser(USER_A, () =>
        db.query(
          `INSERT INTO public.monthly_submissions
             (user_id, portal_id, code, teacher_name, source, student_id, student_name, year, month)
           VALUES ($1, NULL, NULL, 'أبو عبدالله', 'manual', $2, 'فاطمة', $3, 3)`,
          [USER_A, s1, YEAR],
        ),
      ),
    "إدخال يدوي مكرر لنفس (الطالب، العام، الشهر) → مرفوض",
  );

  await throws(
    () =>
      asRole("anon", () =>
        db.query(
          `INSERT INTO public.monthly_submissions
             (user_id, portal_id, code, teacher_name, source, student_id, student_name, year, month)
           VALUES ($1, NULL, NULL, 'متطفل', 'manual', $2, 'فاطمة', $3, 4)`,
          [USER_A, s1, YEAR],
        ),
      ),
    "anon لا يستطيع إنشاء إدخال يدوي (لا رابط نشط وراءه)",
  );

  const srcRow = await one("SELECT source FROM public.monthly_submissions WHERE id = $1", [
    sub1[0].id,
  ]);
  ok(srcRow.source === "portal", "ترسيل الرابط يبقى مصدره portal");
  const namedRow = await one("SELECT teacher_name FROM public.monthly_submissions WHERE id = $1", [
    sub1[0].id,
  ]);
  ok(namedRow.teacher_name === "أم محمد 2", "ترسيل الرابط يرث اسم المعلم/ة من رابطه");

  // ---------- مقيّدات وسلوك عام ----------
  console.log("\nالمقيّدات والسلوك:");
  await throws(
    () =>
      asUser(USER_A, () =>
        db.query(
          `INSERT INTO public.monthly_submissions
             (user_id, portal_id, code, student_id, student_name, year, month, status)
           VALUES ($1, $2, 'TESTCODEA', $3, 'ت', $4, 2, 'bogus')`,
          [USER_A, portalA, s2, YEAR],
        ),
      ),
    "status خارج (pending/approved/rejected) → مرفوض",
  );
  await throws(
    () =>
      asUser(USER_A, () =>
        db.query(
          `INSERT INTO public.teacher_portals (user_id, teacher_name, code, year, month)
           VALUES ($1, 'ت', 'BADMONTH', $2, 13)`,
          [USER_A, YEAR],
        ),
      ),
    "شهر 13 → مرفوض (مقيّد)",
  );
  await throws(
    () =>
      asUser(USER_A, () =>
        db.query(
          `INSERT INTO public.teacher_portals (user_id, teacher_name, code, year, month)
           VALUES ($1, 'ت2', 'TESTCODEA', $2, 6)`,
          [USER_A, YEAR],
        ),
      ),
    "كود رابط مكرر → مرفوض (فهرس فريد)",
  );

  // تحديث updated_at تلقائياً
  const t0row = await one("SELECT updated_at FROM public.teacher_portals WHERE code = 'TESTCODEA'");
  await new Promise((r) => setTimeout(r, 25));
  await asUser(USER_A, () =>
    db.query(
      `UPDATE public.teacher_portals SET teacher_name = 'أم محمد 3' WHERE code = 'TESTCODEA'`,
    ),
  );
  const t1row = await one("SELECT updated_at FROM public.teacher_portals WHERE code = 'TESTCODEA'");
  ok(
    new Date(t1row.updated_at) > new Date(t0row.updated_at),
    "تحديث أي حقل يحدّث updated_at تلقائياً (تريغر)",
  );

  // service_role يرى كل شيء
  const svc = await asRole("service_role", () =>
    q("SELECT count(*)::int c FROM public.monthly_submissions"),
  );
  ok(svc[0].c >= 4, "service_role يرى ترسيلا كل المستخدمين");

  // حذف البوابة يمسح ترسيلا (CASCADE)
  const cascadeBefore = await one(
    "SELECT count(*)::int c FROM public.monthly_submissions WHERE portal_id = $1",
    [portalA],
  );
  await asUser(USER_A, () =>
    db.query(`DELETE FROM public.teacher_portals WHERE id = $1`, [portalA]),
  );
  const cascadeAfter = await one(
    "SELECT count(*)::int c FROM public.monthly_submissions WHERE portal_id = $1",
    [portalA],
  );
  ok(cascadeBefore.c > 0 && cascadeAfter.c === 0, "حذف البوابة يمسح ترسيلا المرتبط (CASCADE)");

  // الدالة تعمل أيضاً للمستخدم المسجل (معاينة المالك)
  const ownerView = await asUser(USER_B, () =>
    q(`SELECT * FROM public.open_teacher_portal('TESTCODEB')`),
  );
  ok(ownerView.length === 1, "المالك المسجل يستطيع معاينة بوابته");

  // ---------- نظام المستخدمين والصلاحيات ----------
  console.log("\nنظام المستخدمين والصلاحيات:");

  const profiles = await q("SELECT id FROM public.profiles");
  ok(profiles.length === 3, "تريغر التسجيل أنشأ ملفاً شخصياً لكل مستخدم (3)");

  const rootAdmin = await asUser(USER_ROOT, () => one("SELECT public.is_admin() AS admin"));
  ok(rootAdmin.admin === true, "أول حساب أُنشئ في المشروع يصبح مسؤولاً تلقائياً");

  const aAdmin = await asUser(USER_A, () => one("SELECT public.is_admin() AS admin"));
  ok(aAdmin.admin === false, "الحساب العادي ليس مسؤولاً");

  await throws(
    () => asUser(USER_A, () => q("SELECT * FROM public.admin_list_users()")),
    "admin_list_users مرفوضة لغير المسؤول",
    "للمسؤول فقط",
  );

  const listed = await asUser(USER_ROOT, () => q("SELECT * FROM public.admin_list_users()"));
  ok(listed.length === 3, "المسؤول يرى قائمة كل المستخدمين (3)");
  ok(
    listed.some((r) => r.id === USER_A && Number(r.students_count) === 3),
    "admin_list_users يعيد عدد طلاب كل مستخدم",
  );

  await asUser(USER_ROOT, () => db.query("SELECT public.admin_set_role($1, true)", [USER_A]));
  const promoted = await asUser(USER_A, () => one("SELECT public.is_admin() AS admin"));
  ok(promoted.admin === true, "المسؤول يستطيع ترقية مستخدم إلى مسؤول");

  await throws(
    () => asUser(USER_A, () => db.query("SELECT public.admin_set_role($1, true)", [USER_A])),
    "لا يستطيع المسؤول تغيير دوره هو",
    "دورك أنت",
  );

  await asUser(USER_ROOT, () => db.query("SELECT public.admin_set_role($1, false)", [USER_A]));
  const demoted = await asUser(USER_A, () => one("SELECT public.is_admin() AS admin"));
  ok(demoted.admin === false, "المسؤول يستطيع إنزال الدور");

  const rootSeesAll = await asUser(USER_ROOT, () => q("SELECT id FROM public.students"));
  ok(rootSeesAll.length === 4, "المسؤول يقرأ بيانات كل المستخدمين (4 طلاب)");

  // اختبار حذف المستخدمين عبر admin_delete_user
  const USER_TEMP = "dddddddd-0000-0000-0000-000000000004";
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'temp@test.dev')", [USER_TEMP]);
  await db.query("INSERT INTO public.students (user_id, name) VALUES ($1, 'طالب مؤقت')", [
    USER_TEMP,
  ]);
  await throws(
    () => asUser(USER_A, () => db.query("SELECT public.admin_delete_user($1)", [USER_TEMP])),
    "admin_delete_user مرفوضة لغير المسؤول",
    "للمسؤول فقط",
  );
  await throws(
    () => asUser(USER_ROOT, () => db.query("SELECT public.admin_delete_user($1)", [USER_ROOT])),
    "لا يستطيع المسؤول حذف حسابه هو",
    "حسابك أنت",
  );
  await asUser(USER_ROOT, () => db.query("SELECT public.admin_delete_user($1)", [USER_TEMP]));
  const tempAfter = await q("SELECT id FROM public.profiles WHERE id = $1", [USER_TEMP]);
  const tempStudentsAfter = await q("SELECT id FROM public.students WHERE user_id = $1", [
    USER_TEMP,
  ]);
  ok(
    tempAfter.length === 0 && tempStudentsAfter.length === 0,
    "المسؤول يستطيع حذف مستخدم وكل بياناته",
  );

  // ---------- مشاركة القراءة («عرض باسم») ----------
  console.log("\nمشاركة القراءة بين المستخدمين:");

  const beforeGrant = await asUser(USER_B, () =>
    q("SELECT id FROM public.students WHERE user_id = $1", [USER_A]),
  );
  ok(beforeGrant.length === 0, "قبل المنح: B لا يرى طلاب A");

  await throws(
    () =>
      asUser(USER_B, () =>
        db.query(
          `INSERT INTO public.data_access_grants (owner_id, grantee_id, access_level)
           VALUES ($1, $2, 'read')`,
          [USER_A, USER_B],
        ),
      ),
    "B لا يستطيع منح نفسه إذناً على بيانات A",
  );

  await throws(
    () =>
      asUser(USER_A, () =>
        db.query(`INSERT INTO public.data_access_grants (owner_id, grantee_id) VALUES ($1, $1)`, [
          USER_A,
        ]),
      ),
    "لا يمكن للمستخدم منح نفسه إذناً (مقيّد owner <> grantee)",
  );

  await asUser(USER_A, () =>
    db.query(
      `INSERT INTO public.data_access_grants (owner_id, grantee_id, access_level)
       VALUES ($1, $2, 'read')`,
      [USER_A, USER_B],
    ),
  );
  const granted = await asUser(USER_B, () =>
    q("SELECT id FROM public.students WHERE user_id = $1", [USER_A]),
  );
  ok(granted.length === 3, "بعد المنح: B يقرأ طلاب A (سياسة القراءة المشتركة)");

  const writeBlocked = await asUser(USER_B, () =>
    db.query(`UPDATE public.students SET name = 'اختراق' WHERE user_id = $1`, [USER_A]),
  );
  ok(writeBlocked.affectedRows === 0, "الاطلاع الممنوح قراءة فقط — B لا يعدّل بيانات A");

  // (في التطبيق يُجلب اسم المالك عبر PostgREST embedded resource؛ هنا JOIN صريح)
  const sharedList = await asUser(USER_B, () =>
    q(
      `SELECT g.owner_id, g.access_level, p.display_name, p.email
         FROM public.data_access_grants g
         LEFT JOIN public.profiles p ON p.id = g.owner_id
        WHERE g.grantee_id = $1`,
      [USER_B],
    ),
  );
  ok(
    sharedList.length === 1 && sharedList[0].owner_id === USER_A,
    "B يرى من شاركه بياناته (قائمة «مسموح لك بالاطلاع على»)",
  );
  ok(
    sharedList[0].display_name === "أبو عبدالله" || sharedList[0].email === "a@test.dev",
    "اسم/بريد المالك يصل مع إذن الاطلاع",
  );

  await asUser(USER_A, () =>
    db.query(`DELETE FROM public.data_access_grants WHERE owner_id = $1 AND grantee_id = $2`, [
      USER_A,
      USER_B,
    ]),
  );
  const afterRevoke = await asUser(USER_B, () =>
    q("SELECT id FROM public.students WHERE user_id = $1", [USER_A]),
  );
  ok(afterRevoke.length === 0, "بعد سحب الإذن: B لا يرى طلاب A");

  // ---------- الملف الشخصي ----------
  console.log("\nالملف الشخصي (profiles):");
  await asUser(USER_A, () =>
    db.query(`UPDATE public.profiles SET display_name = 'أبو عبدالله' WHERE id = $1`, [USER_A]),
  );
  const named = await one("SELECT display_name FROM public.profiles WHERE id = $1", [USER_A]);
  ok(named.display_name === "أبو عبدالله", "المستخدم يحدّث اسمه الظاهر");

  const bEdit = await asUser(USER_B, () =>
    db.query(`UPDATE public.profiles SET display_name = 'اختراق' WHERE id = $1`, [USER_A]),
  );
  ok(bEdit.affectedRows === 0, "B لا يستطيع تعديل ملف A الشخصي (صفّات = 0)");

  // ---------- المتابعة الشهرية 12 شهراً ----------
  console.log("\nالمتابعة الشهرية (محرم — ذو الحجة):");
  await asUser(USER_A, () =>
    db.query(
      `INSERT INTO public.monthly_tracking (user_id, student_id, year, month)
       VALUES ($1, $2, $3, 12)`,
      [USER_A, s1, YEAR],
    ),
  );
  const m12 = await one(
    "SELECT month FROM public.monthly_tracking WHERE student_id = $1 AND year = $2 AND month = 12",
    [s1, YEAR],
  );
  ok(!!m12 && m12.month === 12, "الشهر 12 (ذو الحجة) مقبول بعد التوسيع");

  await throws(
    () =>
      asUser(USER_A, () =>
        db.query(
          `INSERT INTO public.monthly_tracking (user_id, student_id, year, month)
           VALUES ($1, $2, $3, 13)`,
          [USER_A, s2, YEAR],
        ),
      ),
    "الشهر 13 مرفوض (مقيّد 1 — 12)",
  );

  await throws(
    () =>
      asUser(USER_A, () =>
        db.query(
          `INSERT INTO public.monthly_tracking (user_id, student_id, year, month)
           VALUES ($1, $2, $3, 12)`,
          [USER_A, s1, YEAR],
        ),
      ),
    "تكرار (الطالب، العام، الشهر) مرفوض — وهو هدف upsert في التطبيق",
  );

  // بوابة شهر 12 ترى نهاية الشهر 11
  await asUser(USER_A, () =>
    db.query(
      `INSERT INTO public.monthly_tracking
         (user_id, student_id, year, month, memorization_to_surah, memorization_to_ayah)
       VALUES ($1, $2, $3, 11, 5, 7)`,
      [USER_A, s1, YEAR],
    ),
  );
  const decPortal = await asUser(USER_A, () =>
    db.query(
      `INSERT INTO public.teacher_portals (user_id, teacher_name, code, year, month)
       VALUES ($1, 'أبو زيد', 'TESTDEC', $2, 12) RETURNING code`,
      [USER_A, YEAR],
    ),
  );
  ok(decPortal.affectedRows === 1, "إنشاء رابط لشهر 12 مقبول");
  const decView = await asRole("anon", () =>
    q(`SELECT * FROM public.open_teacher_portal('TESTDEC')`),
  );
  const decRow = decView.find((r) => r.student_id === s1);
  ok(
    decRow && decRow.prev_memo_surah === 5 && decRow.prev_memo_ayah === 7,
    "بوابة شهر 12 تجلب نهاية الشهر 11 كنقطة بدء",
  );

  // ---------- حقول ملف الطالب/ة التفصيلية ----------
  console.log("\nحقول ملف الطالب/ة التفصيلية:");
  const studentCols = await q(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'students'`,
  );
  const studentColNames = new Set(studentCols.map((c) => c.column_name));
  for (const col of [
    "gender",
    "hijri_join_date",
    "initial_hifz",
    "first_competition_year",
    "status",
    "school_grade",
    "guardian_phone",
    "student_phone",
    "custom_fields",
    "notes",
  ]) {
    ok(studentColNames.has(col), `العمود students.${col} موجود`);
  }

  await asUser(USER_A, () =>
    db.query(
      `UPDATE public.students
         SET gender = 'أنثى', school_grade = 'الرابع الابتدائي', custom_fields = $2::jsonb
       WHERE id = $1`,
      [s1, JSON.stringify({ col1: "قيمة" })],
    ),
  );
  const enriched = await one(
    "SELECT gender, school_grade, custom_fields FROM public.students WHERE id = $1",
    [s1],
  );
  ok(
    enriched.gender === "أنثى" && enriched.school_grade === "الرابع الابتدائي",
    "حفظ الجنس والسنة الدراسية وقت الالتحاق",
  );
  ok(
    enriched.custom_fields && enriched.custom_fields.col1 === "قيمة",
    "الأعمدة المخصّصة تُحفظ jsonb وتُقرأ كما هي",
  );

  const settingsCols = await q(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_settings'`,
  );
  const settingsColNames = new Set(settingsCols.map((c) => c.column_name));
  ok(
    settingsColNames.has("student_custom_columns") && settingsColNames.has("student_statuses"),
    "إعدادات الأعمدة المخصّصة وحالات الطلاب موجودة في user_settings",
  );

  // سياسة القراءة المشتركة مضافة على كل جداول البيانات التي تحمل user_id
  const sharedPolicies = await q(
    `SELECT tablename FROM pg_policies
      WHERE schemaname = 'public' AND policyname = 'Shared read through access grants'`,
  );
  const sharedTables = new Set(sharedPolicies.map((r) => r.tablename));
  for (const table of [
    "students",
    "year_data",
    "monthly_tracking",
    "teachers",
    "awards",
    "certificates",
    "media",
    "trainees",
    "training_courses",
    "exam_questions",
    "student_competitions",
    "teacher_portals",
    "monthly_submissions",
  ]) {
    ok(sharedTables.has(table), `سياسة القراءة المشتركة مضافة على ${table}`);
  }

  // ---------- إعادة تشغيل الترحيلات (idempotency) ----------
  console.log("\nإعادة تشغيل ترحيلات الميزات وحذف الجداول:");
  // السيناريو الواقعي: قاعدة مُرحَّلة بالكامل، ثم أعاد المستخدم لصق أحد
  // ملفات الميزات الجديدة في محرّك SQL عن طريق الخطأ. يجب ألا يفشل شيء
  // وألا تتغير البيانات.
  const migrationsDir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
  const db2 = new PGlite();
  await applyStubs(db2);
  const runFile = async (f, label) => {
    const sql = await readFile(join(migrationsDir, f), "utf8");
    for (const stmt of splitStatements(sql)) {
      try {
        await db2.query(stmt);
      } catch (err) {
        throw new Error(`فشل ${label} (${f}) عند: ${stmt.slice(0, 80)}…\n${err.message}`);
      }
    }
  };
  for (const f of files) await runFile(f, "الترحيل");

  const newMigrations = files.filter(
    (f) =>
      f.startsWith("20261011130000") ||
      f.startsWith("20261011130100") ||
      f.startsWith("20261011140000") ||
      f.startsWith("20261011150000"),
  );
  ok(newMigrations.length === 4, "ملفات الميزات الجديدة الأربعة موجودة");

  // بيانات قبل الإعادة — يجب أن تبقى كما هي
  await db2.query("INSERT INTO auth.users (id, email) VALUES ($1, 'c@test.dev')", [
    "cccccccc-0000-0000-0000-000000000003",
  ]);
  await db2.query(
    `INSERT INTO public.students (user_id, name, gender, school_grade)
     VALUES ('cccccccc-0000-0000-0000-000000000003', 'سالم', 'ذكر', 'الخامس الابتدائي')`,
  );

  for (const f of newMigrations) await runFile(f, "إعادة الترحيل");

  const rebuilt = (
    await db2.query(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('teacher_portals', 'monthly_submissions',
                            'profiles', 'user_roles', 'data_access_grants')`,
    )
  ).rows;
  ok(rebuilt.length === 5, "إعادة تشغيل ترحيلات الميزات لا تفشل (idempotent)");

  const survived = (
    await db2.query(
      `SELECT name, gender, school_grade FROM public.students
        WHERE user_id = 'cccccccc-0000-0000-0000-000000000003'`,
    )
  ).rows;
  ok(
    survived.length === 1 &&
      survived[0].name === "سالم" &&
      survived[0].gender === "ذكر" &&
      survived[0].school_grade === "الخامس الابتدائي",
    "إعادة تشغيل الترحيلات لا تمسّ بيانات الطلاب المحفوظة",
  );
  const profilesAfter = (await db2.query("SELECT count(*)::int c FROM public.profiles")).rows;
  ok(profilesAfter[0].c === 1, "ملفات الحسابات لا تُكرَّر عند إعادة الترحيل");

  // ---------- حذف كل الجداول (supabase/drop-all-tables.sql) ----------
  // يضمن أن ملف الحذف يعمل فعلاً بعد كل الترحيلات، وأن تواقيع الدوال فيه
  // مطابقة للترحيلات (أي توقيع خاطئ كان سيمرّ بصمت ويترك الدالة في القاعدة).
  const dropSql = await readFile(
    fileURLToPath(new URL("../supabase/drop-all-tables.sql", import.meta.url)),
    "utf8",
  );
  for (const stmt of splitStatements(dropSql)) {
    try {
      await db2.query(stmt);
    } catch (err) {
      throw new Error(`فشل drop-all-tables.sql عند: ${stmt.slice(0, 80)}…\n${err.message}`);
    }
  }
  const leftTables = (
    await db2.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
  ).rows;
  ok(leftTables.length === 0, "drop-all-tables.sql يحذف كل جداول public");

  const leftFns = (
    await db2.query(
      `SELECT p.proname FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('open_teacher_portal', 'submit_teacher_monthly',
                           'admin_list_users', 'admin_set_role', 'admin_delete_user',
                           'is_admin', 'can_read_user_data', 'is_admin_email', 'has_role',
                           'admin_email', 'handle_new_user',
                           'update_updated_at_column')`,
    )
  ).rows;
  ok(leftFns.length === 0, "drop-all-tables.sql يحذف كل دوال المشروع (تواقيع مطابقة)");

  const leftTypes = (
    await db2.query(
      `SELECT t.typname FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typname = 'app_role'`,
    )
  ).rows;
  ok(leftTypes.length === 0, "drop-all-tables.sql يحذف نوع الأدوار app_role");
  await db2.close();

  console.log(`\n✅ نجحت ${passed} اختباراً خلال ${Date.now() - t0}ms.\n`);
}

main()
  .catch((err) => {
    console.error("\n❌ فشل الاختبار:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (db) await db.close();
  });
