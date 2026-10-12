/**
 * اختبار تكاملي: طبقة التطبيق (storage.ts / localDB.ts / teacherPortal.ts /
 * users.ts) فوق قاعدة بيانات المجلد المحلية — نفس الدوال التي تستدعيها الشاشات.
 * التشغيل: npm run test:db
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { MemoryBackend } from "@/offline/backends/memoryBackend";
import { parseTableText } from "@/offline/folderDb";

// storage.ts يستخدم window.setTimeout لجدولة الحفظ.
(globalThis as unknown as { window: typeof globalThis }).window ??= globalThis;

const backend = new MemoryBackend();
let storage: typeof import("@/utils/storage");
let portal: typeof import("@/utils/teacherPortal");
let users: typeof import("@/utils/users");
let db: (typeof import("@/offline/dbManager"))["db"];

before(async () => {
  ({ db } = await import("@/offline/dbManager"));
  db.dailyBackups = false;
  db.flushDelayMs = 5;
  await db.open(backend);
  storage = await import("@/utils/storage");
  portal = await import("@/utils/teacherPortal");
  users = await import("@/utils/users");
});

const emptyYear = () => storage.emptyYearData();

test("إضافة طلاب وتسجيلهم في عام وقراءتهم كما تفعل شاشة المسابقة", async () => {
  const id1 = await storage.saveStudent({ name: "مريم علي", teacher: "أم خالد", gender: "أنثى" });
  const id2 = await storage.saveStudent({ name: "سارة محمد", teacher: "أم خالد" });
  assert.equal(id1, 1);
  assert.equal(id2, 2);
  await storage.registerStudentInYear("1447", id1 as number, "أم خالد");
  await storage.saveYearData("1447", id2 as number, {
    ...emptyYear(),
    teacher: "أم خالد",
    parts: "2",
    total: "88",
  });
  await storage.saveHifzHistory(id2 as number, { h1446: "5" });

  const list = await storage.loadAllStudentsWithData("1447");
  assert.equal(list.length, 2);
  const sara = list.find((s) => s.id === id2);
  assert.equal(sara?.yearData?.total, "88");
  assert.equal(sara?.hifzHistory?.h1446, "5");
  assert.equal(list.find((s) => s.id === id1)?.gender, "أنثى");

  // تعديل جزئي لا يمسح باقي حقول الملف
  await storage.saveStudent({
    id: id1 as number,
    name: "مريم علي",
    teacher: "أم خالد",
    notes: "متفوقة",
  });
  const global = await storage.loadGlobalStudents();
  const mariam = global.find((s) => s.id === id1);
  assert.equal(mariam?.gender, "أنثى");
  assert.equal(mariam?.notes, "متفوقة");

  // تعديل بيانات العام نفسه لا ينشئ صفاً مكرراً
  await storage.saveYearData("1447", id2 as number, {
    ...emptyYear(),
    teacher: "أم خالد",
    total: "90",
  });
  assert.equal(
    db.all("year_data").filter((r) => r.student_id === id2 && r.year === "1447").length,
    1,
  );
});

test("العام النشط والإعدادات تُحفظ في المجلد", async () => {
  await storage.setActiveYear("1447");
  assert.equal(await storage.getActiveYear(), "1447");
  await storage.saveStudentStatuses(["طبيعي", "يتيم"]);
  assert.deepEqual(await storage.loadStudentStatuses(), ["طبيعي", "يتيم"]);
  await storage.saveCustomColumns([{ id: "c1", name: "الحي", type: "text" }]);
  assert.equal((await storage.loadCustomColumns())[0].name, "الحي");
  await db.flush();
  const settingsRows = parseTableText(String(backend.files.get("app_settings.json")));
  assert.ok(settingsRows.some((r) => r.key === "active_year" && r.value === "1447"));
  const userSettings = parseTableText(String(backend.files.get("user_settings.json")));
  assert.equal(userSettings[0].active_year, "1447");
});

test("المتابعة الشهرية: حفظ وقراءة وإعادة احتساب السنوية", async () => {
  const id = 2;
  const record = {
    memoFrom: { surah: 78, ayah: 1 },
    memoTo: { surah: 80, ayah: 42 },
    memoHifzScore: "18",
    memoRecitationScore: "17",
    reviewFrom: { surah: null, ayah: null },
    reviewTo: { surah: null, ayah: null },
    reviewHifzScore: "",
    reviewRecitationScore: "",
    attendanceScore: "9",
    behaviorScore: "10",
  };
  assert.equal(await storage.saveMonthlyRecord("1447", id, 1, record), true);
  // إعادة الحفظ لنفس الشهر تحدّث الصف ولا تكرره
  assert.equal(
    await storage.saveMonthlyRecord("1447", id, 1, { ...record, attendanceScore: "10" }),
    true,
  );
  assert.equal(db.all("monthly_tracking").length, 1);

  const month = await storage.loadMonthlyTrackingForMonth("1447", 1);
  assert.equal(month[id].attendanceScore, "10");
  assert.equal(month[id].memoTo.surah, 80);

  const yd = await storage.loadYearData("1447", id);
  assert.notEqual(yd.parts, "2", "حفظ جديد يُعاد احتسابه من الأوجه");
  assert.equal(yd.annual, "20");

  const latest = await storage.getLatestTrackedPeriod();
  assert.deepEqual(latest, { year: "1447", month: 1 });

  const prev = await storage.getPreviousMonthEndPoints("1447", id, 2);
  assert.deepEqual(prev.memoFrom, { surah: 80, ayah: 42 });

  const rankings = await storage.getMonthlyRankings("1447", 1);
  assert.equal(rankings[0].memoScore, 35);
});

test("الخاتمون والخاتمات وفحص الاسم المكرر", async () => {
  await storage.saveYearData("1446", 1, {
    ...emptyYear(),
    totalHifz: "30",
    total: "97",
    grade: "ممتاز",
  });
  const k = await storage.loadKhatimat();
  assert.equal(k.length, 1);
  assert.equal(k[0].name, "مريم علي");
  assert.equal(k[0].year, "1446");

  const dup = await storage.checkGlobalDuplicateName("مريم  علي");
  assert.deepEqual(dup, { studentId: 1, years: ["1446", "1447"] });
  assert.equal(await storage.checkGlobalDuplicateName("مريم علي", 1), null);
});

test("استدعاء طالب/ة من عام سابق وفصله من عام", async () => {
  const candidates = await storage.listRecallCandidates("1448");
  assert.ok(candidates.some((c) => c.id === 1));
  assert.equal(await storage.recallStudentsToYear("1448", [1]), 1);
  assert.ok(db.all("year_data").some((r) => r.student_id === 1 && r.year === "1448"));
  await storage.deleteStudentFromYear("1448", 1);
  assert.ok(!db.all("year_data").some((r) => r.student_id === 1 && r.year === "1448"));
});

test("المعلمون والجوائز والداعمون (CRUD المحلي)", async () => {
  const t = await storage.saveTeacher({ name: "أم خالد", year: "1447" });
  const again = await storage.saveTeacher({ name: "أم خالد", year: "1447" });
  assert.equal(again?.id, t?.id, "نفس المعلم/ة لنفس العام لا يتكرر");
  assert.equal((await storage.loadTeachers("1447")).length, 1);
  await storage.saveTeacherBonus({ teacher_name: "أم خالد", year: "1447", month: 1, amount: 5000 });
  await storage.saveTeacherBonus({ teacher_name: "أم خالد", year: "1447", month: 1, amount: 7000 });
  const bonuses = await storage.loadTeacherBonuses("1447");
  assert.equal(bonuses.length, 1);
  assert.equal(bonuses[0].amount, 7000);
  const donor = await storage.saveDonor({
    year: "1447",
    name: "فاعل خير",
    donor_type: "person",
    pledged_amount: 100,
    paid_amount: 50,
  });
  assert.equal((await storage.loadDonors("1447"))[0].name, "فاعل خير");
  await storage.deleteDonorLocal(donor?.id as string);
  assert.equal((await storage.loadDonors("1447")).length, 0);
});

test("دمج الأسماء المكررة ينقل البيانات دون تعارض المعرّفات", async () => {
  const dupId = await storage.saveStudent({ name: "سارة  محمد", teacher: "" });
  await storage.saveYearData("1445", dupId as number, { ...emptyYear(), total: "70" });
  // عام مشترك مع السجل الأساسي (2): بيانات الأساسي فيها مجموع فلا تُستبدل
  await storage.saveYearData("1447", dupId as number, { ...emptyYear(), total: "50" });
  const merged = await storage.mergeDuplicateStudents();
  assert.equal(merged, 1);
  const ids = db.all("students").map((s) => s.id);
  assert.ok(!ids.includes(dupId));
  const years = db
    .all("year_data")
    .filter((r) => r.student_id === 2)
    .map((r) => r.year)
    .sort();
  assert.deepEqual(years, ["1445", "1447"]);
  const ydIds = db.all("year_data").map((r) => r.id);
  assert.equal(new Set(ydIds).size, ydIds.length, "لا معرّفات مكررة");
});

test("بوابة المعلم/ة والوارد والتقرير اليدوي", async () => {
  const uid = (await users.getMyProfile())?.id as string;
  const created = await portal.createPortal(uid, {
    teacher_name: "أم خالد",
    year: "1447",
    month: 2,
  });
  assert.equal(created.active, true);
  assert.equal(portal.getPortalLink(created), `/teacher?t=${created.code}&y=1447&m=2`);

  const opened = await portal.openPortalByCode(created.code);
  assert.equal(opened.error, null);
  assert.equal(opened.portal?.students.length, 2);
  const student = opened.portal?.students.find((s) => s.student_id === 2);
  assert.deepEqual(student?.prevMemo, { surah: 80, ayah: 42 });

  const form = {
    ...portal.emptyForm(),
    memoFromSurah: "80",
    memoFromAyah: "43",
    memoHifz: "19",
    attendance: "10",
  };
  const rec = portal.formToRecord(form);
  const sent = await portal.submitTeacherMonthly({
    code: created.code,
    student_id: 2,
    student_name: "سارة محمد",
    year: "1447",
    month: 2,
    memorization_from_surah: rec.memoFrom.surah,
    memorization_from_ayah: rec.memoFrom.ayah,
    memorization_to_surah: null,
    memorization_to_ayah: null,
    memorization_hifz_score: 19,
    memorization_recitation_score: 0,
    review_from_surah: null,
    review_from_ayah: null,
    review_to_surah: null,
    review_to_ayah: null,
    review_hifz_score: 0,
    review_recitation_score: 0,
    attendance_score: 10,
    behavior_score: 0,
    notes: "ممتازة",
  });
  assert.deepEqual(sent, { ok: true, error: null });

  const inbox = await portal.loadSubmissions(uid, { year: "1447" });
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].portal_teacher_name, "أم خالد");
  assert.equal(inbox[0].source, "portal");

  await portal.setSubmissionStatus(uid, inbox[0].id, "approved");
  assert.equal((await portal.loadSubmissions(uid, { status: "approved" })).length, 1);

  const manual = await portal.saveManualSubmission(uid, {
    teacher_name: "أم سعيد",
    student_id: 1,
    student_name: "مريم علي",
    year: "1447",
    month: 2,
    form: { ...portal.emptyForm(), behavior: "9" },
  });
  const manual2 = await portal.saveManualSubmission(uid, {
    teacher_name: "أم سعيد",
    student_id: 1,
    student_name: "مريم علي",
    year: "1447",
    month: 2,
    form: { ...portal.emptyForm(), behavior: "10" },
    status: "approved",
  });
  assert.equal(manual2.id, manual.id, "التقرير اليدوي لنفس الشهر يُحدَّث ولا يتكرر");
  assert.equal(manual2.source, "manual");

  await portal.deletePortal(uid, created.id);
  const after = await portal.loadSubmissions(uid);
  assert.deepEqual(
    after.map((s) => s.source),
    ["manual"],
    "حذف البوابة يحذف ترسيلاتها فقط",
  );
});

test("الاسم الظاهر والمستخدم المحلي", async () => {
  await users.updateMyDisplayName("أبو عبدالله");
  assert.equal((await users.getMyProfile())?.display_name, "أبو عبدالله");
  assert.equal(await users.checkIsAdmin(), false);
  await assert.rejects(users.grantAccess("x"), /غير متاحة/);
});

test("حذف طالب/ة يحذف بياناته المرتبطة، وحذف كل البيانات يمسح الجداول ويحفظ", async () => {
  await storage.deleteStudent(1);
  assert.ok(!db.all("year_data").some((r) => r.student_id === 1));
  assert.ok(!db.all("monthly_submissions").some((r) => r.student_id === 1));

  await storage.deleteAllData();
  await db.flush();
  for (const t of [
    "students",
    "year_data",
    "hifz_history",
    "monthly_tracking",
    "teachers",
    "teacher_bonuses",
  ]) {
    assert.equal(parseTableText(String(backend.files.get(`${t}.json`))).length, 0, t);
  }
  // الإعدادات تبقى كما في النسخة السحابية
  assert.equal(await storage.getActiveYear(), "1447");
});
