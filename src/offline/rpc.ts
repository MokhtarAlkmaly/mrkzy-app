/**
 * الدوال المخزنة (RPC) — نسخ محلية مطابقة لدوال PostgreSQL الأصلية في
 * supabase/migrations/20261011140000_teacher_portal_and_submissions.sql.
 *
 * في النسخة المحلية تُفتح «بوابة المعلم/ة» على نفس الجهاز (يسلّم المشرف
 * الجهاز للمعلم/ة)، ويُحفظ الترسيل في «وارد المعلمين والمعلمات» للمراجعة.
 */

import { DbError, type FolderDb } from "./folderDb";
import { valuesEqual } from "./query";
import type { Row } from "./schema";

type RpcHandler = (db: FolderDb, args: Record<string, unknown>) => unknown;

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const intOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const raise = (message: string): never => {
  throw new DbError("P0001", message);
};

const openTeacherPortal: RpcHandler = (db, args) => {
  const code = String(args.p_code ?? "");
  const portal = db
    .rowsRef("teacher_portals")
    .find((p) => p.code === code && p.active === true);
  if (!portal) return [];

  const yearStudentIds = new Set(
    db
      .rowsRef("year_data")
      .filter((y) => valuesEqual(y.year, portal.year))
      .map((y) => String(y.student_id)),
  );
  const students = db
    .rowsRef("students")
    .filter((s) => valuesEqual(s.user_id, portal.user_id) && yearStudentIds.has(String(s.id)));

  const prevMonth = num(portal.month) - 1;
  const tracking = db
    .rowsRef("monthly_tracking")
    .filter((m) => valuesEqual(m.year, portal.year) && num(m.month) === prevMonth);
  const prevByStudent = new Map(tracking.map((m) => [String(m.student_id), m]));
  const subs = db.rowsRef("monthly_submissions").filter((s) => valuesEqual(s.portal_id, portal.id));
  const subByStudent = new Map<string, Row>();
  for (const s of subs) {
    if (!subByStudent.has(String(s.student_id))) subByStudent.set(String(s.student_id), s);
  }

  return students
    .map((s) => {
      const prev = prevByStudent.get(String(s.id));
      const sub = subByStudent.get(String(s.id));
      return {
        code: portal.code,
        teacher_name: portal.teacher_name,
        year: portal.year,
        month: portal.month,
        student_id: s.id,
        student_name: s.name,
        prev_memo_surah: intOrNull(prev?.memorization_to_surah),
        prev_memo_ayah: intOrNull(prev?.memorization_to_ayah),
        prev_review_surah: intOrNull(prev?.review_to_surah),
        prev_review_ayah: intOrNull(prev?.review_to_ayah),
        submission: sub
          ? {
              status: sub.status,
              memorization_from_surah: sub.memorization_from_surah ?? null,
              memorization_from_ayah: sub.memorization_from_ayah ?? null,
              memorization_to_surah: sub.memorization_to_surah ?? null,
              memorization_to_ayah: sub.memorization_to_ayah ?? null,
              memorization_hifz_score: sub.memorization_hifz_score ?? 0,
              memorization_recitation_score: sub.memorization_recitation_score ?? 0,
              review_from_surah: sub.review_from_surah ?? null,
              review_from_ayah: sub.review_from_ayah ?? null,
              review_to_surah: sub.review_to_surah ?? null,
              review_to_ayah: sub.review_to_ayah ?? null,
              review_hifz_score: sub.review_hifz_score ?? 0,
              review_recitation_score: sub.review_recitation_score ?? 0,
              attendance_score: sub.attendance_score ?? 0,
              behavior_score: sub.behavior_score ?? 0,
              notes: sub.notes ?? null,
              submitted_at: sub.updated_at ?? null,
            }
          : null,
      };
    })
    .sort((a, b) => String(a.student_name ?? "").localeCompare(String(b.student_name ?? ""), "ar"));
};

const submitTeacherMonthly: RpcHandler = (db, args) => {
  const code = String(args.p_code ?? "");
  const portal = db.rowsRef("teacher_portals").find((p) => p.code === code);
  if (!portal) raise("الرابط غير صالح");
  const p = portal as Row;
  if (p.active !== true) raise("تم إيقاف هذا الرابط");
  if (!valuesEqual(args.p_year, p.year) || num(args.p_month, -1) !== num(p.month)) {
    raise("الرابط لا يطابق العام أو الشهر المحدد");
  }
  const student = db
    .rowsRef("students")
    .find((s) => valuesEqual(s.id, args.p_student_id) && valuesEqual(s.user_id, p.user_id));
  if (!student) raise("الطالب/ة غير موجود في قائمتك");

  const now = new Date().toISOString();
  const payload: Row = {
    user_id: p.user_id,
    portal_id: p.id,
    code: p.code,
    student_id: num(args.p_student_id),
    student_name: String(args.p_student_name ?? ""),
    year: String(args.p_year),
    month: num(args.p_month),
    memorization_from_surah: intOrNull(args.p_memorization_from_surah),
    memorization_from_ayah: intOrNull(args.p_memorization_from_ayah),
    memorization_to_surah: intOrNull(args.p_memorization_to_surah),
    memorization_to_ayah: intOrNull(args.p_memorization_to_ayah),
    memorization_hifz_score: num(args.p_memorization_hifz_score),
    memorization_recitation_score: num(args.p_memorization_recitation_score),
    review_from_surah: intOrNull(args.p_review_from_surah),
    review_from_ayah: intOrNull(args.p_review_from_ayah),
    review_to_surah: intOrNull(args.p_review_to_surah),
    review_to_ayah: intOrNull(args.p_review_to_ayah),
    review_hifz_score: num(args.p_review_hifz_score),
    review_recitation_score: num(args.p_review_recitation_score),
    attendance_score: num(args.p_attendance_score),
    behavior_score: num(args.p_behavior_score),
    notes: (args.p_notes as string | null | undefined) ?? null,
    status: "pending",
    review_note: null,
    reviewed_at: null,
    teacher_name: p.teacher_name,
    source: "portal",
    updated_at: now,
  };

  const [row] = db.upsertRows("monthly_submissions", [payload], ["portal_id", "student_id"]);
  return { ...row };
};

const HANDLERS: Record<string, RpcHandler> = {
  open_teacher_portal: openTeacherPortal,
  submit_teacher_monthly: submitTeacherMonthly,
  // النسخة المحلية لمستخدم واحد: لا مسؤولين ولا مشاركة بيانات.
  is_admin: () => false,
  can_read_user_data: () => true,
};

export const callRpc = (db: FolderDb, fn: string, args: Record<string, unknown> = {}): unknown => {
  const handler = HANDLERS[fn];
  if (!handler) {
    throw new DbError("PGRST202", `الدالة ${fn} غير متاحة في النسخة المحلية`);
  }
  return handler(db, args);
};
