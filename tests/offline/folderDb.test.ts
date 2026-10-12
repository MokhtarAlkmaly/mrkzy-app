/**
 * اختبارات محرك قاعدة بيانات المجلد والعميل المحلي المتوافق مع Supabase.
 * التشغيل: npm run test:db
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FolderDb, parseSnapshotText, serializeSnapshot } from "@/offline/folderDb";
import { MemoryBackend } from "@/offline/backends/memoryBackend";
import { createLocalClient } from "@/offline/localClient";
import { LOCAL_USER_ID, MANIFEST_FILE } from "@/offline/constants";
import { TABLES } from "@/offline/schema";

const setup = async () => {
  const backend = new MemoryBackend();
  const db = new FolderDb({ flushDelayMs: 5, dailyBackups: false });
  const result = await db.open(backend);
  const client = createLocalClient(() => db);
  return { backend, db, client, result };
};

test("فتح مجلد فارغ ينشئ قاعدة بيانات جديدة بكل ملفات الجداول", async () => {
  const { backend, result, db } = await setup();
  assert.equal(result.isNew, true);
  assert.ok(backend.files.has(MANIFEST_FILE));
  for (const def of TABLES) assert.ok(backend.files.has(`${def.name}.json`), def.name);
  const manifest = JSON.parse(String(backend.files.get(MANIFEST_FILE)));
  assert.equal(manifest.app, "mrkzy-net");
  assert.equal(db.status.open, true);
});

test("الإدراج يولّد معرّفات تسلسلية وقيماً افتراضية ويعيد الصفوف مع select()", async () => {
  const { client } = await setup();
  const { data, error } = await client
    .from("students")
    .insert([{ name: "أحمد" }, { name: "فاطمة", teacher: "أم محمد" }])
    .select();
  assert.equal(error, null);
  const rows = data as Array<Record<string, unknown>>;
  assert.deepEqual(
    rows.map((r) => r.id),
    [1, 2],
  );
  assert.equal(rows[0].teacher, "");
  assert.equal(rows[0].user_id, LOCAL_USER_ID);
  assert.deepEqual(rows[0].custom_fields, {});
  assert.ok(rows[0].created_at);

  const noReturn = await client.from("students").insert({ name: "خالد" });
  assert.equal(noReturn.error, null);
  assert.equal(noReturn.data, null);
});

test("المرشحات والترتيب والتقسيم والعدّ", async () => {
  const { client } = await setup();
  await client.from("year_data").insert([
    { student_id: 1, year: "1446", total: "80", teacher: "أ" },
    { student_id: 2, year: "1447", total: "95", teacher: "ب" },
    { student_id: 3, year: "1447", total: "70", teacher: null },
    { student_id: 4, year: "1445", total: "60", teacher: "أ" },
  ]);
  const r1 = await client
    .from("year_data")
    .select("student_id")
    .eq("year", "1447")
    .order("student_id");
  assert.deepEqual(r1.data, [{ student_id: 2 }, { student_id: 3 }]);

  const r2 = await client
    .from("year_data")
    .select("year")
    .order("year", { ascending: false })
    .limit(1);
  assert.deepEqual(r2.data, [{ year: "1447" }]);

  const r3 = await client
    .from("year_data")
    .select("id", { count: "exact", head: true })
    .eq("teacher", "أ");
  assert.equal(r3.count, 2);
  assert.equal(r3.data, null);

  const r4 = await client
    .from("year_data")
    .select("student_id")
    .in("year", ["1445", "1446"])
    .order("student_id");
  assert.deepEqual(r4.data, [{ student_id: 1 }, { student_id: 4 }]);

  const r5 = await client.from("year_data").select("student_id").is("teacher", null);
  assert.deepEqual(r5.data, [{ student_id: 3 }]);

  const r6 = await client.from("year_data").select("student_id").neq("teacher", "أ");
  assert.deepEqual(r6.data, [{ student_id: 2 }]);

  const r7 = await client
    .from("year_data")
    .select("student_id")
    .gte("year", "1446")
    .lt("year", "1447");
  assert.deepEqual(r7.data, [{ student_id: 1 }]);

  const r8 = await client.from("year_data").select("student_id").order("student_id").range(1, 2);
  assert.deepEqual(r8.data, [{ student_id: 2 }, { student_id: 3 }]);

  // 5 و "5" متساويان كما في PostgreSQL مع التحويل الضمني
  const r9 = await client.from("year_data").select("year").eq("student_id", "4");
  assert.deepEqual(r9.data, [{ year: "1445" }]);
});

test("ilike غير حساس لحالة الأحرف ويدعم % و _", async () => {
  const { client } = await setup();
  await client
    .from("students")
    .insert([{ name: "Ahmad Ali" }, { name: "محمد  أحمد" }, { name: "سعيد" }]);
  const a = await client.from("students").select("name").ilike("name", "ahmad ali");
  assert.deepEqual(a.data, [{ name: "Ahmad Ali" }]);
  const b = await client.from("students").select("name").ilike("name", "%أحمد%");
  assert.deepEqual(b.data, [{ name: "محمد  أحمد" }]);
  const c = await client.from("students").select("name").ilike("name", "س_يد");
  assert.deepEqual(c.data, [{ name: "سعيد" }]);
});

test("single و maybeSingle", async () => {
  const { client } = await setup();
  await client.from("teachers").insert([
    { year: "1447", name: "أ" },
    { year: "1447", name: "ب" },
  ]);
  const none = await client.from("teachers").select("*").eq("name", "ج").maybeSingle();
  assert.equal(none.error, null);
  assert.equal(none.data, null);
  const many = await client.from("teachers").select("*").eq("year", "1447").maybeSingle();
  assert.equal(many.error?.code, "PGRST116");
  const one = await client.from("teachers").select("name").eq("name", "ب").single();
  assert.deepEqual(one.data, { name: "ب" });
  const notOne = await client.from("teachers").select("*").eq("name", "ج").single();
  assert.equal(notOne.error?.code, "PGRST116");
});

test("القيود الفريدة ترجع خطأ 23505 يحتوي duplicate", async () => {
  const { client } = await setup();
  const ok = await client.from("teachers").insert({ year: "1447", name: "أم أحمد" });
  assert.equal(ok.error, null);
  const dup = await client.from("teachers").insert({ year: "1447", name: "أم أحمد" });
  assert.equal(dup.error?.code, "23505");
  assert.match(dup.error?.message ?? "", /duplicate/);
  const otherYear = await client.from("teachers").insert({ year: "1446", name: "أم أحمد" });
  assert.equal(otherYear.error, null);

  // الإدخال اليدوي (portal_id فارغ) فريد لكل (طالب، عام، شهر)، لكن الروابط المختلفة لا تتعارض
  await client.from("students").insert({ name: "ط" });
  const m1 = await client
    .from("monthly_submissions")
    .insert({ student_id: 1, student_name: "ط", year: "1447", month: 1, source: "manual" });
  assert.equal(m1.error, null);
  const m2 = await client
    .from("monthly_submissions")
    .insert({ student_id: 1, student_name: "ط", year: "1447", month: 1, source: "manual" });
  assert.equal(m2.error?.code, "23505");
  const m3 = await client
    .from("monthly_submissions")
    .insert({ student_id: 1, student_name: "ط", year: "1447", month: 1, portal_id: "p1" });
  assert.equal(m3.error, null);
});

test("upsert بالمفتاح المركّب يحدّث الصف القائم بدل تكراره", async () => {
  const { client, db } = await setup();
  const base = { user_id: LOCAL_USER_ID, student_id: 7, year: "1447", month: 3 };
  await client
    .from("monthly_tracking")
    .upsert({ ...base, attendance_score: 5 }, { onConflict: "student_id,year,month" });
  await client
    .from("monthly_tracking")
    .upsert({ ...base, attendance_score: 9 }, { onConflict: "student_id,year,month" });
  const rows = db.all("monthly_tracking");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attendance_score, 9);
  assert.equal(rows[0].behavior_score, 0);

  await client
    .from("user_settings")
    .upsert({ user_id: LOCAL_USER_ID, active_year: "1446" }, { onConflict: "user_id" });
  await client
    .from("user_settings")
    .upsert({ user_id: LOCAL_USER_ID, center_name: "مركز" }, { onConflict: "user_id" });
  const settings = db.all("user_settings");
  assert.equal(settings.length, 1);
  assert.equal(settings[0].active_year, "1446");
  assert.equal(settings[0].center_name, "مركز");
});

test("update مع select يعيد الصفوف، والتحديث المخالف للقيد يُلغى بالكامل", async () => {
  const { client, db } = await setup();
  await client.from("teachers").insert([
    { year: "1447", name: "أ" },
    { year: "1447", name: "ب" },
  ]);
  const upd = await client
    .from("teachers")
    .update({ name: "ج" })
    .eq("name", "أ")
    .select()
    .maybeSingle();
  assert.equal((upd.data as Record<string, unknown>).name, "ج");
  const bad = await client.from("teachers").update({ name: "ب" }).eq("name", "ج");
  assert.equal(bad.error?.code, "23505");
  assert.deepEqual(
    db
      .all("teachers")
      .map((t) => t.name)
      .sort(),
    ["ب", "ج"],
  );
});

test("الحذف المتسلسل (CASCADE) كما في PostgreSQL", async () => {
  const { client, db } = await setup();
  await client.from("students").insert([{ name: "أ" }, { name: "ب" }]);
  await client.from("year_data").insert([
    { student_id: 1, year: "1447" },
    { student_id: 2, year: "1447" },
  ]);
  await client.from("hifz_history").insert({ student_id: 1, year_key: "h1446", value: "3" });
  await client.from("monthly_tracking").insert({ student_id: 1, year: "1447", month: 1 });
  const { data: portal } = await client
    .from("teacher_portals")
    .insert({ teacher_name: "م", code: "abc12345", year: "1447", month: 1 })
    .select()
    .single();
  await client.from("monthly_submissions").insert({
    portal_id: (portal as Record<string, unknown>).id,
    student_id: 2,
    student_name: "ب",
    year: "1447",
    month: 1,
  });

  await client.from("students").delete().eq("id", 1);
  assert.deepEqual(
    db.all("year_data").map((r) => r.student_id),
    [2],
  );
  assert.equal(db.all("hifz_history").length, 0);
  assert.equal(db.all("monthly_tracking").length, 0);

  await client.from("teacher_portals").delete().eq("code", "abc12345");
  assert.equal(db.all("monthly_submissions").length, 0);

  // الدورات → التسجيلات
  const { data: course } = await client
    .from("training_courses")
    .insert({ name: "خياطة" })
    .select()
    .single();
  const { data: trainee } = await client.from("trainees").insert({ name: "هند" }).select().single();
  const c = course as Record<string, unknown>;
  const t = trainee as Record<string, unknown>;
  await client.from("training_enrollments").insert({ trainee_id: t.id, course_id: c.id });
  assert.equal(c.status, "active");
  const dupEnroll = await client
    .from("training_enrollments")
    .insert({ trainee_id: t.id, course_id: c.id });
  assert.match(dupEnroll.error?.message ?? "", /duplicate/);
  await client.from("training_courses").delete().eq("id", c.id);
  assert.equal(db.all("training_enrollments").length, 0);
});

test("تضمين العلاقات: students(name) و alias:teacher_portals(...) و training_courses(name)", async () => {
  const { client } = await setup();
  await client.from("students").insert([{ name: "زينب" }]);
  await client.from("year_data").insert([
    { student_id: 1, year: "1447", total_hifz: "30" },
    { student_id: 99, year: "1447" },
  ]);
  const k = await client
    .from("year_data")
    .select("student_id, year, total_hifz, students(name)")
    .order("student_id");
  assert.deepEqual(k.data, [
    { student_id: 1, year: "1447", total_hifz: "30", students: { name: "زينب" } },
    { student_id: 99, year: "1447", total_hifz: "0", students: null },
  ]);

  const { data: portal } = await client
    .from("teacher_portals")
    .insert({ teacher_name: "أم علي", code: "zz", year: "1447", month: 2 })
    .select("id")
    .single();
  await client.from("monthly_submissions").insert([
    {
      portal_id: (portal as Record<string, unknown>).id,
      student_id: 1,
      student_name: "زينب",
      year: "1447",
      month: 2,
    },
    {
      student_id: 1,
      student_name: "زينب",
      year: "1447",
      month: 3,
      source: "manual",
      teacher_name: "يدوي",
    },
  ]);
  const subs = await client
    .from("monthly_submissions")
    .select("*, portal:teacher_portals(teacher_name)")
    .order("month");
  const rows = subs.data as Array<Record<string, unknown>>;
  assert.deepEqual(rows[0].portal, { teacher_name: "أم علي" });
  assert.equal(rows[1].portal, null);
  assert.equal(rows[0].status, "pending");

  const { data: course } = await client
    .from("training_courses")
    .insert({ name: "نقش" })
    .select()
    .single();
  const { data: trainee } = await client
    .from("trainees")
    .insert({ name: "سارة" })
    .select()
    .single();
  await client.from("training_enrollments").insert({
    trainee_id: (trainee as Record<string, unknown>).id,
    course_id: (course as Record<string, unknown>).id,
  });
  const enr = await client
    .from("training_enrollments")
    .select("id, trainee_id, status, training_courses(name)");
  assert.deepEqual((enr.data as Array<Record<string, unknown>>)[0].training_courses, {
    name: "نقش",
  });
});

test("الحفظ إلى المجلد ثم إعادة الفتح يحافظ على البيانات والعدّاد التسلسلي", async () => {
  const backend = new MemoryBackend();
  const db1 = new FolderDb({ flushDelayMs: 5, dailyBackups: false });
  await db1.open(backend);
  const c1 = createLocalClient(() => db1);
  await c1.from("students").insert([{ name: "أ" }, { name: "ب" }, { name: "ج" }]);
  await c1.from("students").delete().eq("id", 3);
  await db1.flush();
  assert.equal(db1.hasPendingWrites(), false);
  const text = String(backend.files.get("students.json"));
  assert.match(text, /"table":"students"/);
  JSON.parse(text); // ملف JSON صالح

  const db2 = new FolderDb({ flushDelayMs: 5, dailyBackups: false });
  const reopened = await db2.open(backend);
  assert.equal(reopened.isNew, false);
  assert.equal(reopened.counts.students, 2);
  const c2 = createLocalClient(() => db2);
  const { data } = await c2.from("students").insert({ name: "د" }).select("id").single();
  // المعرّف 3 حُذف سابقاً ولا يُعاد استخدامه (مثل BIGSERIAL)
  assert.deepEqual(data, { id: 4 });
});

test("الحفظ التلقائي يجمّع التعديلات في كتابة واحدة", async () => {
  const { backend, client, db } = await setup();
  const before = backend.writes;
  for (let i = 0; i < 20; i++) await client.from("donors").insert({ year: "1447", name: `د${i}` });
  assert.equal(backend.writes, before);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(db.hasPendingWrites(), false);
  // ملف donors + ملف التعريف فقط
  assert.ok(backend.writes - before <= 3, `writes=${backend.writes - before}`);
  assert.equal(JSON.parse(String(backend.files.get("donors.json"))).rows.length, 20);
});

test("ملف جدول تالف: يُحفظ نسخة منه ويبدأ الجدول فارغاً مع تحذير", async () => {
  const backend = new MemoryBackend();
  const db1 = new FolderDb({ flushDelayMs: 5, dailyBackups: false });
  await db1.open(backend);
  await createLocalClient(() => db1)
    .from("awards")
    .insert({ year: "1447", recipient_type: "student", recipient_name: "س", award_type: "annual" });
  await db1.flush();
  backend.files.set("awards.json", "{ هذا ليس JSON");

  const db2 = new FolderDb({ flushDelayMs: 5, dailyBackups: false });
  const res = await db2.open(backend);
  assert.equal(res.warnings.length, 1);
  assert.equal(db2.all("awards").length, 0);
  const kept = Array.from(backend.files.keys()).find((k) => k.startsWith("awards.corrupt-"));
  assert.ok(kept, "يجب حفظ نسخة من الملف التالف");
  assert.equal(backend.files.get(kept as string), "{ هذا ليس JSON");
});

test("استرجاع الملف المؤقت إن انقطعت الكتابة قبل إعادة التسمية", async () => {
  const backend = new MemoryBackend();
  const db1 = new FolderDb({ flushDelayMs: 5, dailyBackups: false });
  await db1.open(backend);
  await createLocalClient(() => db1)
    .from("trainees")
    .insert({ name: "منى" });
  await db1.flush();
  const text = backend.files.get("trainees.json") as string;
  backend.files.delete("trainees.json");
  backend.files.set("trainees.json.tmp", text);

  const db2 = new FolderDb({ flushDelayMs: 5, dailyBackups: false });
  await db2.open(backend);
  assert.equal(db2.all("trainees")[0].name, "منى");
  assert.ok(backend.files.has("trainees.json"), "يُعاد كتابة الملف الأصلي");
});

test("فشل الكتابة: تبقى التعديلات معلقة ويظهر الخطأ ثم ينجح الحفظ لاحقاً", async () => {
  const { backend, client, db } = await setup();
  backend.failWrites = new Error("أُزيلت بطاقة الذاكرة");
  await client.from("certificates").insert({ year: "1447", recipient_name: "س" });
  await assert.rejects(db.flush(), /بطاقة الذاكرة/);
  assert.match(db.status.lastError ?? "", /بطاقة الذاكرة/);
  assert.equal(db.hasPendingWrites(), true);
  backend.failWrites = null;
  await db.flush();
  assert.equal(db.status.lastError, null);
  assert.equal(JSON.parse(String(backend.files.get("certificates.json"))).rows.length, 1);
});

test("النسخة الاحتياطية اليومية تُنشأ مرة في اليوم وتُقلَّم الأقدم", async () => {
  const backend = new MemoryBackend();
  for (let d = 1; d <= 16; d++) {
    backend.files.set(`backups/mrkzy-backup-2020-01-${String(d).padStart(2, "0")}.json`, "{}");
  }
  const db = new FolderDb({ flushDelayMs: 5, dailyBackups: true });
  await db.open(backend);
  await createLocalClient(() => db)
    .from("students")
    .insert({ name: "أ" });
  await db.flush();
  const daily = Array.from(backend.files.keys())
    .filter((k) => k.startsWith("backups/mrkzy-backup-"))
    .sort();
  assert.equal(daily.length, 14);
  assert.ok(!daily.includes("backups/mrkzy-backup-2020-01-01.json"));
  const today = daily[daily.length - 1];
  const snapshot = parseSnapshotText(String(backend.files.get(today)));
  assert.equal(snapshot.tables.students.length, 1);

  const writesBefore = backend.writes;
  await createLocalClient(() => db)
    .from("students")
    .insert({ name: "ب" });
  await db.flush();
  // لا نسخة يومية ثانية في نفس اليوم: جدول + ملف تعريف فقط
  assert.equal(backend.writes - writesBefore, 2);
});

test("تصدير/استيراد نسخة احتياطية واستبدال كل البيانات", async () => {
  const { client, db } = await setup();
  await client.from("students").insert([{ name: "أ" }, { name: "ب" }]);
  await client.from("exam_questions").insert({ year: "1447", question: "س1", choices: ["أ", "ب"] });
  const text = serializeSnapshot(db.snapshot());
  const snap = parseSnapshotText(text);
  assert.equal(snap.tables.students.length, 2);
  assert.deepEqual(snap.tables.exam_questions[0].choices, ["أ", "ب"]);

  const other = await setup();
  await other.client.from("students").insert({ name: "قديم" });
  await other.db.replaceAll(snap.tables);
  assert.deepEqual(
    other.db.all("students").map((s) => s.name),
    ["أ", "ب"],
  );
  const { data } = await other.client.from("students").insert({ name: "ج" }).select("id").single();
  assert.deepEqual(data, { id: 3 });

  assert.throws(() => parseSnapshotText("[]"), /ليس نسخة احتياطية/);
  assert.throws(() => parseSnapshotText("not json"), /JSON/);
});

test("دوال بوابة المعلم/ة (RPC) تعمل محلياً بنفس فحوصات الخادم", async () => {
  const { client, db } = await setup();
  await client
    .from("students")
    .insert([{ name: "ب-طالبة" }, { name: "أ-طالبة" }, { name: "خارج العام" }]);
  await client.from("year_data").insert([
    { student_id: 1, year: "1447" },
    { student_id: 2, year: "1447" },
    { student_id: 3, year: "1446" },
  ]);
  await client.from("monthly_tracking").insert({
    student_id: 1,
    year: "1447",
    month: 1,
    memorization_to_surah: 78,
    memorization_to_ayah: 40,
  });
  await client
    .from("teacher_portals")
    .insert({ teacher_name: "أم سعيد", code: "code1234", year: "1447", month: 2 });

  const open = await client.rpc("open_teacher_portal", { p_code: "code1234" });
  assert.equal(open.error, null);
  const rows = open.data as Array<Record<string, unknown>>;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].student_name, "أ-طالبة");
  const b = rows.find((r) => r.student_id === 1) as Record<string, unknown>;
  assert.equal(b.prev_memo_surah, 78);
  assert.equal(b.prev_memo_ayah, 40);
  assert.equal(b.submission, null);

  const bad = await client.rpc("open_teacher_portal", { p_code: "nope" });
  assert.deepEqual(bad.data, []);

  const args = {
    p_code: "code1234",
    p_student_id: 1,
    p_student_name: "ب-طالبة",
    p_year: "1447",
    p_month: 2,
    p_memorization_from_surah: 78,
    p_memorization_from_ayah: 41,
    p_memorization_to_surah: 79,
    p_memorization_to_ayah: 10,
    p_memorization_hifz_score: 18,
    p_attendance_score: 10,
  };
  const sent = await client.rpc("submit_teacher_monthly", args);
  assert.equal(sent.error, null);
  const again = await client.rpc("submit_teacher_monthly", {
    ...args,
    p_memorization_hifz_score: 20,
  });
  assert.equal(again.error, null);
  const subs = db.all("monthly_submissions");
  assert.equal(subs.length, 1);
  assert.equal(subs[0].memorization_hifz_score, 20);
  assert.equal(subs[0].status, "pending");
  assert.equal(subs[0].teacher_name, "أم سعيد");

  const wrongMonth = await client.rpc("submit_teacher_monthly", { ...args, p_month: 3 });
  assert.equal(wrongMonth.error?.message, "الرابط لا يطابق العام أو الشهر المحدد");
  const wrongStudent = await client.rpc("submit_teacher_monthly", { ...args, p_student_id: 999 });
  assert.equal(wrongStudent.error?.message, "الطالب/ة غير موجود في قائمتك");
  await client.from("teacher_portals").update({ active: false }).eq("code", "code1234");
  const stopped = await client.rpc("submit_teacher_monthly", args);
  assert.equal(stopped.error?.message, "تم إيقاف هذا الرابط");
  const invalid = await client.rpc("submit_teacher_monthly", { ...args, p_code: "x" });
  assert.equal(invalid.error?.message, "الرابط غير صالح");

  const reopened = await client.rpc("open_teacher_portal", { p_code: "code1234" });
  assert.deepEqual(reopened.data, []);
});

test("التخزين: رفع الملفات وروابط العرض والحذف داخل مجلد media", async () => {
  const { client, backend } = await setup();
  const up = await client.storage
    .from("media")
    .upload("1447/a.jpg", new Blob(["img"], { type: "image/jpeg" }));
  assert.equal(up.error, null);
  assert.ok(backend.files.has("media/1447/a.jpg"));
  const signed = await client.storage
    .from("media")
    .createSignedUrls(["1447/a.jpg", "1447/missing.jpg"], 60);
  assert.equal(signed.data?.[0].signedUrl, "memory://media/1447/a.jpg");
  assert.ok(signed.data?.[1].error);
  await client.storage.from("media").remove(["1447/a.jpg"]);
  assert.ok(!backend.files.has("media/1447/a.jpg"));
});

test("جدول غير معروف يرجع خطأ واضحاً بدل الانهيار", async () => {
  const { client } = await setup();
  const res = await client.from("no_such_table").select("*");
  assert.equal(res.error?.code, "42P01");
});
