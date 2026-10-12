import {
  Student,
  HifzHistory,
  YearData,
  START_YEAR,
  CustomColumnDef,
  DEFAULT_STATUSES,
} from "@/types/student";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { resolveBaseHifz } from "./calculations";
import {
  getCachedStudents,
  putCachedStudent,
  deleteCachedStudent,
  getCachedHifzHistory,
  putCachedHifzRow,
  getCachedYearData,
  putCachedYearData,
  setCachedSetting,
  getCachedSetting,
  isCachePopulated,
  getCachedTeachers,
  putCachedTeacher,
  deleteCachedTeacher,
  getCachedTeacherBonuses,
  putCachedTeacherBonus,
  deleteCachedTeacherBonus,
  getCachedDonors,
  putCachedDonor,
  deleteCachedDonor,
  getCachedAwards,
  putCachedAward,
  deleteCachedAward,
  getCachedCeremonyExpenses,
  putCachedCeremonyExpense,
  deleteCachedCeremonyExpense,
  getCachedCertificates,
  putCachedCertificate,
  deleteCachedCertificate,
  getCachedMedia,
  putCachedMedia,
  deleteCachedMedia,
  CachedTeacher,
  CachedTeacherBonus,
  CachedDonor,
  CachedAward,
  CachedCeremonyExpense,
  CachedCertificate,
  CachedMedia,
} from "./localDB";
// markDirty/clearPending بلا عمل في النسخة المحلية (لا يوجد ما يُرفع) — أُبقيت للتوافق.
import { markDirty, clearPending } from "./localDB";
import { normalizeStudentName } from "./studentNames";
import { getViewAsId, isViewingOtherUser } from "./viewAs";
import { LOCAL_USER_ID } from "@/offline/constants";
import { db as folderDb } from "@/offline/dbManager";

// صف المتابعة الشهرية (نفس أعمدة جدول monthly_tracking)
type MonthlyTrackingRow = Database["public"]["Tables"]["monthly_tracking"]["Row"];

// ===== المستخدم المحلي =====
// النسخة التي تعمل بدون إنترنت لمستخدم واحد على الجهاز: لا تسجيل دخول ولا
// حسابات. كل الصفوف تُنسب إلى LOCAL_USER_ID وتُحفظ في مجلد قاعدة البيانات.

/** معرّف المستخدم المحلي (ثابت). */
const getAuthUserId = async (): Promise<string | null> => LOCAL_USER_ID;

/** صاحب البيانات التي تُقرأ/تُكتب — دائماً المستخدم المحلي. */
const getUserId = async (): Promise<string | null> => {
  const viewing = getViewAsId();
  if (viewing) return viewing;
  return getAuthUserId();
};

/** خطأ يُرمى عند محاولة التعديل أثناء وضع القراءة فقط (غير مستخدم محلياً). */
export class ReadOnlyViewError extends Error {
  constructor() {
    super("أنت في وضع الاطلاع على بيانات مستخدم آخر — التعديل غير مسموح");
    this.name = "ReadOnlyViewError";
  }
}

/** يمنع أي كتابة أثناء وضع الاطلاع (لا يحدث في النسخة المحلية). */
const guardWrite = () => {
  if (isViewingOtherUser()) throw new ReadOnlyViewError();
};

// ===== «السحابة» هنا هي قاعدة بيانات المجلد المحلية نفسها =====
// كل الدوال التي كانت تكلّم Supabase تكلّم الآن العميل المحلي (نفس الواجهة)،
// لذلك هي متاحة دائماً — لا يوجد «اتصال» يُنتظر.
const isOnline = () => true;

const canUseCloud = (userId: string | null): userId is string => !!userId;

const newLocalId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

let ensureCachePromise: Promise<void> | null = null;
let ensureCacheUserId: string | null = null;

const invalidateEnsureCache = () => {
  ensureCachePromise = null;
  ensureCacheUserId = null;
};

const ensureCache = async () => {
  const userId = await getUserId();
  if (!userId) return;

  // نتيجة الفحص محفوظة لكل مالك على حدة: تبديل الحساب المعروض يعيد الفحص.
  if (ensureCachePromise && ensureCacheUserId === userId) {
    return ensureCachePromise;
  }

  ensureCacheUserId = userId;
  const run = (async () => {
    const hasCache = await isCachePopulated();
    if (!hasCache) {
      await syncFromCloud();
    }
  })().catch((error) => {
    // لا نُبقي على وعد فاشل: المحاولة القادمة يجب أن تعيد الفحص.
    if (ensureCachePromise === run) invalidateEnsureCache();
    throw error;
  });
  ensureCachePromise = run;
  return run;
};

const belongsToUser = <T extends { user_id: string }>(row: T, userId: string) =>
  row.user_id === userId;

const byYear = <T extends { year: string }>(rows: T[], year?: string) =>
  year ? rows.filter((row) => row.year === year) : rows;

// ===== حقول ملف الطالب/ة التفصيلية =====
// أعمدة اختيارية أُضيفت إلى جدول students (الجنس، السنة الدراسية، تاريخ
// الالتحاق، الحفظ الأولي، الحالة، هواتف الطالب/ة وولي الأمر، الأعمدة
// المخصصة، والملاحظات). تُنقل كما هي بين السحابة والكاش المحلي والواجهة.
const STUDENT_PROFILE_FIELDS = [
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
] as const;

export type StudentProfileField = (typeof STUDENT_PROFILE_FIELDS)[number];

export type StudentProfileValues = {
  [K in StudentProfileField]?: K extends "custom_fields" ? Record<string, string> : string;
};

/** يلتقط حقول الملف التفصيلية من صف (سحابة أو كاش) متسامحاً مع الناقص منها. */
const pickProfileFields = (row: Record<string, unknown>): StudentProfileValues => {
  const out: Record<string, unknown> = {};
  for (const field of STUDENT_PROFILE_FIELDS) {
    const value = row[field];
    out[field] = value === undefined ? null : value;
  }
  return out as StudentProfileValues;
};

/** يحوّل حقول الملف التفصيلية المخزَّنة إلى شكل الطالب/ة المعروض في الواجهة. */
const profileToStudent = (row: Record<string, unknown>): Required<StudentProfileValues> => ({
  gender: (row.gender as string) || "",
  hijri_join_date: (row.hijri_join_date as string) || "",
  initial_hifz: (row.initial_hifz as string) || "",
  first_competition_year: (row.first_competition_year as string) || "",
  status: (row.status as string) || "طبيعي",
  school_grade: (row.school_grade as string) || "",
  guardian_phone: (row.guardian_phone as string) || "",
  student_phone: (row.student_phone as string) || "",
  custom_fields: (row.custom_fields as Record<string, string>) || {},
  notes: (row.notes as string) || "",
});

// ===== «المزامنة» في النسخة المحلية =====
export type ProgressCb = (current: number, total: number, label?: string) => void;

/**
 * يعيد قراءة البيانات من مجلد قاعدة البيانات (بعد حفظ أي تعديل معلّق).
 * مفيد إن استُبدلت ملفات المجلد يدوياً (مثلاً نُسخت من جوال آخر).
 */
export const syncFromCloud = async (onProgress?: ProgressCb): Promise<boolean> => {
  try {
    onProgress?.(0, 2, "حفظ التعديلات");
    await folderDb.flush();
    onProgress?.(1, 2, "قراءة المجلد");
    await folderDb.reload();
    invalidateEnsureCache();
    onProgress?.(2, 2, "اكتمل");
    return true;
  } catch (err) {
    console.error("تعذّرت إعادة القراءة من مجلد قاعدة البيانات:", err);
    return false;
  }
};

// ===== Load students with data from LOCAL cache =====
export const loadAllStudentsWithData = async (currentYear: string): Promise<Student[]> => {
  const hasCache = await isCachePopulated();
  if (!hasCache) {
    await syncFromCloud();
  }

  const students = await getCachedStudents();
  const allHistory = await getCachedHifzHistory();
  const allYearData = await getCachedYearData();

  const historyMap: Record<number, HifzHistory> = {};
  allHistory.forEach((row) => {
    if (!historyMap[row.student_id]) historyMap[row.student_id] = {};
    historyMap[row.student_id][row.year_key] = row.value;
  });

  // Derive history from year_data.parts for ALL years (not just immediately previous).
  // This ensures cumulative "previous hifz" reflects every prior year a student had parts in.
  allYearData.forEach((row) => {
    const parts = parseFloat(row.parts) || 0;
    if (parts <= 0) return;
    if (!historyMap[row.student_id]) historyMap[row.student_id] = {};
    const key = `h${row.year}`;
    const existing = parseFloat(historyMap[row.student_id][key]) || 0;
    if (parts > existing) {
      historyMap[row.student_id][key] = parts.toString();
    }
  });

  const yearDataMap: Record<number, YearData> = {};
  allYearData
    .filter((r) => r.year === currentYear)
    .forEach((row) => {
      yearDataMap[row.student_id] = {
        baseHifz: row.base_hifz,
        totalHifz: row.total_hifz,
        parts: row.parts,
        annual: row.annual,
        recitation: row.recitation,
        memorization: row.memorization,
        total: row.total,
        grade: row.grade,
        prize: row.prize,
        statusPrize: row.status_prize,
        rank: row.rank,
        teacher: row.teacher || "",
      };
    });

  // كل سنة مستقلة: نعرض فقط الطلاب والطالبات المسجّلون في السنة المختارة
  return students
    .filter((s) => yearDataMap[s.id])
    .map((s) => ({
      id: s.id,
      name: s.name,
      teacher: yearDataMap[s.id]?.teacher || s.teacher || "",
      ...profileToStudent(s as unknown as Record<string, unknown>),
      hifzHistory: historyMap[s.id] || {},
      yearData: yearDataMap[s.id],
    }));
};

/**
 * طلاب/طالبات عام محدّد مع بياناته — اسم مطابق للشاشات المنقولة
 * (إدارة الحلقات، وارد المعلمين والمعلمات) ويعادل loadAllStudentsWithData.
 */
export const loadStudentsForYear = loadAllStudentsWithData;

export const emptyYearData = (): YearData => ({
  baseHifz: "0",
  totalHifz: "0",
  parts: "",
  annual: "",
  recitation: "",
  memorization: "",
  total: "0",
  grade: "",
  prize: "0",
  statusPrize: "",
  rank: "-",
  teacher: "",
});

export interface RecallCandidate {
  id: number;
  name: string;
  teacher: string;
  lastYear: string;
  baseHifz: number;
  years: string[];
}

// الطلاب والطالبات الموجودون في أعوام أخرى وغير مسجّلين في العام المختار
export const listRecallCandidates = async (year: string): Promise<RecallCandidate[]> => {
  await ensureCache();
  const students = await getCachedStudents();
  const allYearData = await getCachedYearData();
  const allHistory = await getCachedHifzHistory();
  const yearNum = parseInt(year);

  const byStudent = new Map<number, typeof allYearData>();
  allYearData.forEach((row) => {
    const list = byStudent.get(row.student_id) || [];
    list.push(row);
    byStudent.set(row.student_id, list);
  });

  const historyMap: Record<number, HifzHistory> = {};
  allHistory.forEach((row) => {
    if (!historyMap[row.student_id]) historyMap[row.student_id] = {};
    historyMap[row.student_id][row.year_key] = row.value;
  });

  const candidates: RecallCandidate[] = [];
  for (const s of students) {
    const rows = byStudent.get(s.id) || [];
    if (rows.some((r) => r.year === year)) continue;
    const previous = rows
      .filter((r) => parseInt(r.year) < yearNum)
      .sort((a, b) => a.year.localeCompare(b.year));
    if (previous.length === 0) continue;

    const history = { ...(historyMap[s.id] || {}) };
    previous.forEach((r) => {
      const parts = parseFloat(r.parts) || 0;
      if (parts > 0) {
        const key = `h${r.year}`;
        if ((parseFloat(history[key]) || 0) < parts) history[key] = parts.toString();
      }
    });

    const last = previous[previous.length - 1];
    const lastTotalHifz = parseFloat(last.total_hifz) || 0;
    const baseHifz = resolveBaseHifz(history, yearNum, lastTotalHifz);

    candidates.push({
      id: s.id,
      name: s.name,
      teacher: last.teacher || s.teacher || "",
      lastYear: last.year,
      baseHifz,
      years: rows.map((r) => r.year).sort(),
    });
  }

  return candidates.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
};

// استدعاء طلاب وطالبات من الأعوام السابقة إلى العام المختار مع ترحيل الحفظ التراكمي
export const recallStudentsToYear = async (year: string, ids: number[]): Promise<number> => {
  guardWrite();
  const candidates = await listRecallCandidates(year);
  const map = new Map(candidates.map((c) => [c.id, c]));
  let added = 0;

  for (const id of ids) {
    const c = map.get(id);
    if (!c) continue;
    await saveYearData(year, id, {
      ...emptyYearData(),
      teacher: c.teacher,
      baseHifz: c.baseHifz.toString(),
      totalHifz: c.baseHifz.toString(),
    });
    added++;
  }

  return added;
};

// تسجيل طالب/طالبة في العام المختار (لطالب/طالبة جديدة)
export const registerStudentInYear = async (year: string, studentId: number, teacher = "") => {
  guardWrite();
  await saveYearData(year, studentId, { ...emptyYearData(), teacher });
};

export const loadGlobalStudents = async (): Promise<Student[]> => {
  const students = await getCachedStudents();
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    teacher: s.teacher,
    ...profileToStudent(s as unknown as Record<string, unknown>),
  }));
};

// طالب في السجل الرئيسي: كل سنواته المسجّلة فيها + بيانات آخر سنة (للإحصائيات)
export interface StudentAllYears extends Student {
  years: string[];
}

// سجل رئيسي شامل: كل الطلاب والطالبات المسجلين في كل الأعوام (وليس عامًا بعينه)
export const loadAllStudentsAllYears = async (): Promise<StudentAllYears[]> => {
  const hasCache = await isCachePopulated();
  if (!hasCache) {
    await syncFromCloud();
  }

  const students = await getCachedStudents();
  const allYearData = await getCachedYearData();

  const byStudent = new Map<number, typeof allYearData>();
  allYearData.forEach((row) => {
    const list = byStudent.get(row.student_id) || [];
    list.push(row);
    byStudent.set(row.student_id, list);
  });

  return students
    .map((s) => {
      const rows = (byStudent.get(s.id) || []).slice().sort((a, b) => a.year.localeCompare(b.year));
      const latest = rows[rows.length - 1];
      return {
        id: s.id,
        name: s.name,
        teacher: latest ? latest.teacher || s.teacher || "" : s.teacher || "",
        ...profileToStudent(s as unknown as Record<string, unknown>),
        registered_years: rows.map((r) => r.year),
        years: rows.map((r) => r.year),
        yearData: latest
          ? {
              baseHifz: latest.base_hifz,
              totalHifz: latest.total_hifz,
              parts: latest.parts,
              annual: latest.annual,
              recitation: latest.recitation,
              memorization: latest.memorization,
              total: latest.total,
              grade: latest.grade,
              prize: latest.prize,
              statusPrize: latest.status_prize,
              rank: latest.rank,
              teacher: latest.teacher || "",
            }
          : undefined,
      };
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
};

// ===== Save to LOCAL cache only (not cloud) =====
export const saveStudent = async (
  student: {
    id?: number;
    name: string;
    teacher: string;
  } & StudentProfileValues,
): Promise<number | null> => {
  guardWrite();
  const userId = await getUserId();
  if (!userId) return null;

  // الحقول غير الممرَّرة تبقى كما هي في الكاش (تعديل جزئي لا يمسح باقي الملف).
  const existingRow = student.id
    ? ((await getCachedStudents()).find((s) => s.id === student.id) ?? {})
    : {};
  // إصلاح: كانت الحقول غير الممرَّرة تتحول إلى null فتمسح بيانات الملف (الجنس،
  // الهواتف، الأعمدة المخصصة...) عند الحفظ من جدول المسابقة أو صفحة المعلمين.
  // الآن لا يُستبدل إلا ما مُرِّر فعلاً.
  const provided: Record<string, unknown> = {};
  for (const field of STUDENT_PROFILE_FIELDS) {
    const value = (student as unknown as Record<string, unknown>)[field];
    if (value !== undefined) provided[field] = value;
  }
  const profile = {
    ...pickProfileFields(existingRow as unknown as Record<string, unknown>),
    ...provided,
  };

  if (student.id) {
    await putCachedStudent({
      id: student.id,
      name: student.name,
      teacher: student.teacher,
      user_id: userId,
      ...profile,
    });
    await markDirty("student", "upsert", { id: student.id });
    return student.id;
  } else {
    // معرّف تسلسلي من قاعدة البيانات المحلية (مثل BIGSERIAL في السحابة).
    const [inserted] = folderDb.insertRows("students", [
      {
        name: student.name,
        teacher: student.teacher,
        user_id: userId,
        ...profile,
      },
    ]);
    return Number(inserted.id);
  }
};

export const deleteStudent = async (id: number) => {
  guardWrite();
  await deleteCachedStudent(id);
  await clearPending(`student:${id}`);
  await markDirty("student", "delete", { id });
  // Also delete related cache
  const allHistory = await getCachedHifzHistory();
  const allYearData = await getCachedYearData();
  const { deleteItem } = await import("./localDB");
  for (const row of allHistory.filter((r) => r.student_id === id)) {
    await deleteItem("hifz_history", [row.student_id, row.year_key]);
    await clearPending(`hifz:${row.student_id}|${row.year_key}`);
  }
  for (const row of allYearData.filter((r) => r.student_id === id)) {
    await deleteItem("year_data", [row.student_id, row.year]);
    await clearPending(`year:${row.student_id}|${row.year}`);
  }
  queueCloudSync();
};

/**
 * يحذف كل بيانات الحساب الحالي من السحابة والكاش المحلي (الطلاب، الأعوام،
 * المتابعة الشهرية، الحلقات، المعلمين، الجوائز، الشهادات، الداعمين، المصروفات،
 * المسابقات، أسئلة الاختبارات، المتدربين، الدورات، والوسائط).
 */
export const deleteAllData = async () => {
  guardWrite();
  const { clearStore, clearAllPending } = await import("./localDB");

  const userId = await getUserId();
  if (canUseCloud(userId)) {
    try {
      // حذف ملفات الوسائط من التخزين السحابي إن وُجدت
      const cachedMedia = await getCachedMedia();
      const { data: cloudMedia } = await supabase
        .from("media")
        .select("file_path")
        .eq("user_id", userId);
      const paths = Array.from(
        new Set(
          [
            ...cachedMedia.map((m) => m.file_path),
            ...(cloudMedia || []).map((m) => m.file_path),
          ].filter(Boolean),
        ),
      );
      if (paths.length > 0) {
        await supabase.storage.from("media").remove(paths);
      }

      // حذف الجداول التابعة أولاً ثم الأساسية
      await Promise.all([
        supabase.from("monthly_submissions").delete().eq("user_id", userId),
        supabase.from("monthly_tracking").delete().eq("user_id", userId),
        supabase.from("hifz_history").delete().eq("user_id", userId),
        supabase.from("year_data").delete().eq("user_id", userId),
        supabase.from("training_enrollments").delete().eq("user_id", userId),
      ]);

      await Promise.all([
        supabase.from("teacher_portals").delete().eq("user_id", userId),
        supabase.from("students").delete().eq("user_id", userId),
        supabase.from("trainees").delete().eq("user_id", userId),
        supabase.from("training_courses").delete().eq("user_id", userId),
        supabase.from("teacher_bonuses").delete().eq("user_id", userId),
        supabase.from("teachers").delete().eq("user_id", userId),
        supabase.from("awards").delete().eq("user_id", userId),
        supabase.from("certificates").delete().eq("user_id", userId),
        supabase.from("ceremony_expenses").delete().eq("user_id", userId),
        supabase.from("donors").delete().eq("user_id", userId),
        supabase.from("student_competitions").delete().eq("user_id", userId),
        supabase.from("exam_questions").delete().eq("user_id", userId),
        supabase.from("media").delete().eq("user_id", userId),
      ]);
    } catch (err) {
      console.error("Cloud wipe failed:", err);
    }
  } else {
    // Offline: queue deletes so next sync removes them
    const [
      existingStudents,
      existingTeachers,
      existingBonuses,
      existingDonors,
      existingAwards,
      existingExpenses,
      existingCerts,
      existingMedia,
    ] = await Promise.all([
      getCachedStudents(),
      getCachedTeachers(),
      getCachedTeacherBonuses(),
      getCachedDonors(),
      getCachedAwards(),
      getCachedCeremonyExpenses(),
      getCachedCertificates(),
      getCachedMedia(),
    ]);
    for (const s of existingStudents) await markDirty("student", "delete", { id: s.id });
    for (const t of existingTeachers) await markDirty("teacher", "delete", { id: t.id });
    for (const b of existingBonuses) await markDirty("teacher_bonus", "delete", { id: b.id });
    for (const d of existingDonors) await markDirty("donor", "delete", { id: d.id });
    for (const a of existingAwards) await markDirty("award", "delete", { id: a.id });
    for (const e of existingExpenses) await markDirty("expense", "delete", { id: e.id });
    for (const c of existingCerts) await markDirty("certificate", "delete", { id: c.id });
    for (const m of existingMedia) {
      await markDirty("media", "delete", { id: m.id, file_path: m.file_path });
    }
  }

  await Promise.all([
    clearStore("students"),
    clearStore("hifz_history"),
    clearStore("year_data"),
    clearStore("teachers"),
    clearStore("teacher_bonuses"),
    clearStore("donors"),
    clearStore("awards"),
    clearStore("ceremony_expenses"),
    clearStore("certificates"),
    clearStore("media"),
  ]);

  if (canUseCloud(userId)) {
    await clearAllPending();
  }
};

export const deleteAllStudents = deleteAllData;

/**
 * فصل طالب/ة من عام واحد (حلقة/سجل العام) دون حذفه من السجل العام.
 *
 * يمسح صف العام وصف الحفظ التاريخي لذلك العام ومتابعته الشهرية — محلياً
 * وفي السحابة. تُستخدم في شاشة «إدارة الحلقات» لإخراج طالب/ة من حلقة.
 *
 * ملاحظة: مسابقات الطالب/ة (student_competitions) مرتبطة بالاسم لا بالمعرّف،
 * لذا لا تُمسح هنا تلقائياً.
 */
export const deleteStudentFromYear = async (year: string, studentId: number) => {
  guardWrite();
  const { deleteItem } = await import("./localDB");
  const userId = await getUserId();
  const historyKey = `h${year}`;

  if (canUseCloud(userId)) {
    const results = await Promise.all([
      supabase
        .from("year_data")
        .delete()
        .eq("user_id", userId)
        .eq("student_id", studentId)
        .eq("year", year),
      supabase
        .from("hifz_history")
        .delete()
        .eq("user_id", userId)
        .eq("student_id", studentId)
        .eq("year_key", historyKey),
      supabase
        .from("monthly_tracking")
        .delete()
        .eq("user_id", userId)
        .eq("student_id", studentId)
        .eq("year", year),
    ]);
    results.forEach((result) => {
      if (result.error) console.error("Cloud year association delete failed:", result.error);
    });
  }

  const yearRows = (await getCachedYearData()).filter((row) => row.student_id === studentId);
  if (yearRows.some((row) => row.year === year)) {
    await deleteItem("year_data", [studentId, year]);
  }
  await markDirty("year", "delete", { student_id: studentId, year });

  const history = (await getCachedHifzHistory()).filter(
    (row) => row.student_id === studentId && row.year_key === historyKey,
  );
  for (const row of history) {
    await deleteItem("hifz_history", [row.student_id, row.year_key]);
  }
  await markDirty("hifz", "delete", { student_id: studentId, year_key: historyKey });

  queueCloudSync();
};

/** فصل عدة طلاب من عام واحد دون المساس بالسجل العام. */
export const deleteStudentsFromYear = async (year: string, ids: number[]) => {
  guardWrite();
  for (const id of Array.from(new Set(ids))) {
    await deleteStudentFromYear(year, id);
  }
};

export interface DeleteYearOptions {
  /** حذف بقية جداول العام (المعلمين، الجوائز، الشهادات، الداعمين، المصروفات، المسابقات، الوسائط). الافتراضي: true عند حذف عام كامل. */
  includeAllYearTables?: boolean;
  /** حذف الطلاب الذين كانوا مسجلين في هذا العام فقط ولا يملكون بيانات في أي عام آخر. */
  deleteOrphanStudents?: boolean;
}

// يحذف بيانات عام واحد (الدرجات + الحفظ + المتابعة الشهرية + بيانات العام)
// دون المساس ببيانات الأعوام الأخرى.
export const deleteYearData = async (year: string, options?: DeleteYearOptions) => {
  guardWrite();
  await ensureCache();
  const { deleteItem } = await import("./localDB");
  const userId = await getUserId();

  const isCompetitionSliceOnly = year.endsWith("D") && !options?.includeAllYearTables;
  const baseYear = year.endsWith("D") ? year.slice(0, -1) : year;
  const yearsToClear = isCompetitionSliceOnly ? [year] : [baseYear, `${baseYear}D`];
  const historyKeys = yearsToClear.map((y) => `h${y}`);
  const includeAllYearTables = options?.includeAllYearTables ?? !isCompetitionSliceOnly;

  const allYearDataBefore = await getCachedYearData();
  const studentsInTargetYear = new Set(
    allYearDataBefore.filter((r) => yearsToClear.includes(r.year)).map((r) => r.student_id),
  );

  if (canUseCloud(userId)) {
    try {
      const tasks: PromiseLike<unknown>[] = [
        supabase.from("year_data").delete().eq("user_id", userId).in("year", yearsToClear),
        supabase.from("hifz_history").delete().eq("user_id", userId).in("year_key", historyKeys),
      ];
      if (!isCompetitionSliceOnly) {
        tasks.push(
          supabase.from("monthly_tracking").delete().eq("user_id", userId).eq("year", baseYear),
          supabase.from("monthly_submissions").delete().eq("user_id", userId).eq("year", baseYear),
        );
      }
      if (includeAllYearTables) {
        const cachedMedia = (await getCachedMedia()).filter((m) => m.year === baseYear);
        const { data: cloudMedia } = await supabase
          .from("media")
          .select("file_path")
          .eq("user_id", userId)
          .eq("year", baseYear);
        const mediaPaths = Array.from(
          new Set(
            [
              ...cachedMedia.map((m) => m.file_path),
              ...(cloudMedia || []).map((m) => m.file_path),
            ].filter(Boolean),
          ),
        );
        if (mediaPaths.length > 0) {
          await supabase.storage.from("media").remove(mediaPaths);
        }

        tasks.push(
          supabase.from("teacher_portals").delete().eq("user_id", userId).eq("year", baseYear),
          supabase.from("teachers").delete().eq("user_id", userId).eq("year", baseYear),
          supabase.from("teacher_bonuses").delete().eq("user_id", userId).eq("year", baseYear),
          supabase.from("awards").delete().eq("user_id", userId).eq("year", baseYear),
          supabase.from("certificates").delete().eq("user_id", userId).eq("year", baseYear),
          supabase.from("donors").delete().eq("user_id", userId).eq("year", baseYear),
          supabase.from("ceremony_expenses").delete().eq("user_id", userId).eq("year", baseYear),
          supabase.from("student_competitions").delete().eq("user_id", userId).eq("year", baseYear),
          supabase.from("exam_questions").delete().eq("user_id", userId).eq("year", baseYear),
          supabase.from("media").delete().eq("user_id", userId).eq("year", baseYear),
        );
      }
      await Promise.all(tasks);
    } catch (err) {
      console.error("Cloud year wipe failed:", err);
    }
  }

  for (const row of allYearDataBefore.filter((r) => yearsToClear.includes(r.year))) {
    await deleteItem("year_data", [row.student_id, row.year]);
    if (canUseCloud(userId)) {
      await clearPending(`year:${row.student_id}|${row.year}`);
    } else {
      await markDirty("year", "delete", { student_id: row.student_id, year: row.year });
    }
  }

  const allHistory = await getCachedHifzHistory();
  for (const row of allHistory.filter((r) => historyKeys.includes(r.year_key))) {
    await deleteItem("hifz_history", [row.student_id, row.year_key]);
    if (canUseCloud(userId)) {
      await clearPending(`hifz:${row.student_id}|${row.year_key}`);
    } else {
      await markDirty("hifz", "delete", { student_id: row.student_id, year_key: row.year_key });
    }
  }

  if (includeAllYearTables) {
    const [teachers, bonuses, donors, awards, expenses, certs, media] = await Promise.all([
      getCachedTeachers(),
      getCachedTeacherBonuses(),
      getCachedDonors(),
      getCachedAwards(),
      getCachedCeremonyExpenses(),
      getCachedCertificates(),
      getCachedMedia(),
    ]);

    for (const r of teachers.filter((t) => t.year === baseYear)) {
      await deleteCachedTeacher(r.id);
      if (canUseCloud(userId)) await clearPending(`teacher:${r.id}`);
      else await markDirty("teacher", "delete", { id: r.id });
    }
    for (const r of bonuses.filter((b) => b.year === baseYear)) {
      await deleteCachedTeacherBonus(r.id);
      if (canUseCloud(userId)) await clearPending(`teacher_bonus:${r.id}`);
      else await markDirty("teacher_bonus", "delete", { id: r.id });
    }
    for (const r of donors.filter((d) => d.year === baseYear)) {
      await deleteCachedDonor(r.id);
      if (canUseCloud(userId)) await clearPending(`donor:${r.id}`);
      else await markDirty("donor", "delete", { id: r.id });
    }
    for (const r of awards.filter((a) => a.year === baseYear)) {
      await deleteCachedAward(r.id);
      if (canUseCloud(userId)) await clearPending(`award:${r.id}`);
      else await markDirty("award", "delete", { id: r.id });
    }
    for (const r of expenses.filter((e) => e.year === baseYear)) {
      await deleteCachedCeremonyExpense(r.id);
      if (canUseCloud(userId)) await clearPending(`expense:${r.id}`);
      else await markDirty("expense", "delete", { id: r.id });
    }
    for (const r of certs.filter((c) => c.year === baseYear)) {
      await deleteCachedCertificate(r.id);
      if (canUseCloud(userId)) await clearPending(`certificate:${r.id}`);
      else await markDirty("certificate", "delete", { id: r.id });
    }
    for (const r of media.filter((m) => m.year === baseYear)) {
      await deleteCachedMedia(r.id);
      if (canUseCloud(userId)) await clearPending(`media:${r.id}`);
      else await markDirty("media", "delete", { id: r.id, file_path: r.file_path });
    }
  }

  if (options?.deleteOrphanStudents && studentsInTargetYear.size > 0) {
    const remainingYearData = await getCachedYearData();
    const studentsWithRemainingYears = new Set(remainingYearData.map((r) => r.student_id));
    const orphanIds = Array.from(studentsInTargetYear).filter(
      (id) => !studentsWithRemainingYears.has(id),
    );
    if (orphanIds.length > 0) {
      await deleteStudents(orphanIds);
      if (canUseCloud(userId)) {
        await syncToCloud();
      }
    }
  }
};

// يحذف مجموعة طلاب وطالبات محددة دفعة واحدة (بكل بياناتهم بكل الأعوام)
export const deleteStudents = async (ids: number[]) => {
  guardWrite();
  for (const id of ids) {
    await deleteStudent(id);
  }
};

export const saveHifzHistory = async (studentId: number, history: HifzHistory) => {
  guardWrite();
  for (const [yearKey, value] of Object.entries(history)) {
    await putCachedHifzRow({ student_id: studentId, year_key: yearKey, value: value || "0" });
    await markDirty("hifz", "upsert", { student_id: studentId, year_key: yearKey });
  }
};

export const loadHifzHistory = async (studentId: number): Promise<HifzHistory> => {
  const allHistory = await getCachedHifzHistory();
  const history: HifzHistory = {};
  allHistory
    .filter((r) => r.student_id === studentId)
    .forEach((r) => {
      history[r.year_key] = r.value;
    });
  return history;
};

export const saveYearData = async (year: string, studentId: number, data: YearData) => {
  guardWrite();
  await putCachedYearData({
    student_id: studentId,
    year,
    base_hifz: data.baseHifz,
    total_hifz: data.totalHifz,
    parts: data.parts,
    annual: data.annual,
    recitation: data.recitation,
    memorization: data.memorization,
    total: data.total,
    grade: data.grade,
    prize: data.prize,
    status_prize: data.statusPrize,
    rank: data.rank,
    teacher: data.teacher || "",
  });
  await markDirty("year", "upsert", { student_id: studentId, year });
};

export const loadYearData = async (year: string, studentId: number): Promise<YearData> => {
  const defaultData: YearData = {
    baseHifz: "0",
    totalHifz: "0",
    parts: "",
    annual: "",
    recitation: "",
    memorization: "",
    total: "0",
    grade: "",
    prize: "0",
    statusPrize: "",
    rank: "-",
    teacher: "",
  };

  const allYearData = await getCachedYearData();
  const row = allYearData.find((r) => r.student_id === studentId && r.year === year);
  if (!row) return defaultData;

  return {
    baseHifz: row.base_hifz,
    totalHifz: row.total_hifz,
    parts: row.parts,
    annual: row.annual,
    recitation: row.recitation,
    memorization: row.memorization,
    total: row.total,
    grade: row.grade,
    prize: row.prize,
    statusPrize: row.status_prize,
    rank: row.rank,
    teacher: row.teacher || "",
  };
};

// Latest Hijri year that actually has data; falls back to the first competition year
const getLatestDataYear = async (): Promise<string> => {
  try {
    const cached = await getCachedYearData();
    const cachedYears = cached.map((r) => r.year).filter(Boolean);
    if (cachedYears.length) return cachedYears.sort().slice(-1)[0];
  } catch {
    /* ignore */
  }

  const userId = await getUserId();
  if (canUseCloud(userId)) {
    const { data } = await supabase
      .from("year_data")
      .select("year")
      .eq("user_id", userId)
      .order("year", { ascending: false })
      .limit(1);
    if (data?.[0]?.year) return data[0].year;
  }

  return String(START_YEAR);
};

export const getActiveYear = async (): Promise<string> => {
  const hasCache = await isCachePopulated();
  if (hasCache) {
    const year = await getCachedSetting<string>("active_year");
    if (year) return year;
    return getLatestDataYear();
  }

  // Fallback to cloud
  const userId = await getUserId();
  if (!canUseCloud(userId)) return getLatestDataYear();

  const { data } = await supabase
    .from("user_settings")
    .select("active_year")
    .eq("user_id", userId)
    .maybeSingle();

  const year = data?.active_year || (await getLatestDataYear());
  await setCachedSetting("active_year", year);
  return year;
};

export const setActiveYear = async (year: string) => {
  // تبديل العام مجرد تنقل في العرض، لذا يبقى مسموحاً أثناء الاطلاع، لكنه
  // يُحفظ محلياً فقط ولا يمسّ إعدادات صاحب البيانات.
  await setCachedSetting("active_year", year);
  if (isViewingOtherUser()) return;
  // Also save to cloud if online
  const userId = await getUserId();
  if (canUseCloud(userId)) {
    await supabase
      .from("user_settings")
      .upsert({ user_id: userId, active_year: year }, { onConflict: "user_id" });
  }
};

export const getTableFilters = async <T>(): Promise<T | undefined> => {
  const cached = await getCachedSetting<T>("table_filters");
  if (cached) return cached;

  const userId = await getUserId();
  if (!canUseCloud(userId)) return undefined;

  const { data } = await supabase
    .from("user_settings")
    .select("table_filters")
    .eq("user_id", userId)
    .maybeSingle();

  const filters = data?.table_filters as T | undefined;
  if (filters) {
    await setCachedSetting("table_filters", filters);
  }
  return filters;
};

export const setTableFilters = async (filters: Json) => {
  // مرشّحات الجدول تفضيل عرض محلي؛ تُحفظ محلياً فقط أثناء الاطلاع.
  await setCachedSetting("table_filters", filters);
  if (isViewingOtherUser()) return;

  const userId = await getUserId();
  if (!canUseCloud(userId)) return;

  await supabase
    .from("user_settings")
    .upsert({ user_id: userId, table_filters: filters }, { onConflict: "user_id" });
};

// ===== الأعمدة المخصّصة في سجل الطلاب =====
// تعريفات أعمدة يضيفها المستخدم من «الإعدادات»، وتُخزَّن قيمها داخل
// students.custom_fields. تُحفظ محلياً أولاً ثم تُرفع للسحابة عند الاتصال.
export const loadCustomColumns = async (): Promise<CustomColumnDef[]> => {
  await ensureCache();
  const cached = await getCachedSetting<CustomColumnDef[]>("student_custom_columns");
  if (Array.isArray(cached)) return cached;

  const userId = await getUserId();
  if (canUseCloud(userId)) {
    const { data } = await supabase
      .from("user_settings")
      .select("student_custom_columns")
      .eq("user_id", userId)
      .maybeSingle();
    const cloud = data?.student_custom_columns as CustomColumnDef[] | null;
    if (Array.isArray(cloud)) {
      await setCachedSetting("student_custom_columns", cloud);
      return cloud;
    }
  }

  return [];
};

export const saveCustomColumns = async (cols: CustomColumnDef[]) => {
  guardWrite();
  await setCachedSetting("student_custom_columns", cols);

  const userId = await getUserId();
  if (canUseCloud(userId)) {
    await supabase
      .from("user_settings")
      .upsert(
        { user_id: userId, student_custom_columns: cols as unknown as Json },
        { onConflict: "user_id" },
      );
  }
};

// ===== حالات الطلاب المخصّصة =====
// قائمة الحالات المتاحة في القائمة المنسدلة (طبيعي/يتيم/مسكين/…). يبدأ
// المستخدم بالقائمة الافتراضية ويستطيع تعديلها من «الإعدادات».
export const loadStudentStatuses = async (): Promise<string[]> => {
  await ensureCache();
  const cached = await getCachedSetting<string[]>("student_statuses");
  if (Array.isArray(cached) && cached.length > 0) return cached;

  const userId = await getUserId();
  if (canUseCloud(userId)) {
    const { data } = await supabase
      .from("user_settings")
      .select("student_statuses")
      .eq("user_id", userId)
      .maybeSingle();
    const cloud = data?.student_statuses as string[] | null;
    if (Array.isArray(cloud) && cloud.length > 0) {
      await setCachedSetting("student_statuses", cloud);
      return cloud;
    }
  }

  return DEFAULT_STATUSES;
};

export const saveStudentStatuses = async (statuses: string[]) => {
  guardWrite();
  const normalized = statuses.map((status) => status.trim()).filter(Boolean);
  await setCachedSetting("student_statuses", normalized);

  const userId = await getUserId();
  if (canUseCloud(userId)) {
    await supabase
      .from("user_settings")
      .upsert({ user_id: userId, student_statuses: normalized }, { onConflict: "user_id" });
  }
};

export const migrateYearData = async (newYear: string, students: { id: number }[]) => {
  guardWrite();
  const newYearNum = parseInt(newYear);
  const previousYear = newYearNum - 1;

  for (const student of students) {
    const history = await loadHifzHistory(student.id);
    const previousYearData = await loadYearData(previousYear.toString(), student.id);

    const previousParts = parseFloat(previousYearData.parts) || 0;
    if (previousParts > 0) {
      const historyKey = `h${previousYear}`;
      history[historyKey] = previousParts.toString();
      await saveHifzHistory(student.id, history);
    }
  }
};

const queueCloudSync = () => {
  if (isViewingOtherUser()) return;
  if (!isOnline()) return;
  window.setTimeout(() => {
    void syncToCloud();
  }, 0);
};

// ===== Local-first CRUD for additional modules =====

export type TeacherRow = CachedTeacher;
export type TeacherBonusRow = CachedTeacherBonus;
export type DonorRow = CachedDonor;
export type AwardRow = CachedAward;
export type CeremonyExpenseRow = CachedCeremonyExpense;
export type CertificateRow = CachedCertificate;
export type MediaMetadataRow = CachedMedia;

export const loadTeachers = async (year?: string): Promise<TeacherRow[]> => {
  await ensureCache();
  const userId = await getUserId();
  if (!userId) return [];
  const rows = await getCachedTeachers();
  return byYear(
    rows.filter((r) => belongsToUser(r, userId)),
    year,
  ).sort((a, b) => a.name.localeCompare(b.name, "ar"));
};

export const saveTeacher = async (
  teacher: Partial<TeacherRow> & { name: string; year: string },
): Promise<TeacherRow | null> => {
  guardWrite();
  const userId = await getUserId();
  if (!userId) return null;
  const existing = teacher.id
    ? undefined
    : (await getCachedTeachers()).find(
        (t) => t.user_id === userId && t.year === teacher.year && t.name === teacher.name,
      );
  const row: TeacherRow = {
    id: teacher.id || existing?.id || newLocalId(),
    user_id: userId,
    year: teacher.year,
    name: teacher.name,
    created_at: teacher.created_at || existing?.created_at,
    updated_at: new Date().toISOString(),
  };
  await putCachedTeacher(row);
  await markDirty("teacher", "upsert", { id: row.id });
  queueCloudSync();
  return row;
};

export const deleteTeacherLocal = async (id: string) => {
  guardWrite();
  await deleteCachedTeacher(id);
  await markDirty("teacher", "delete", { id });
  queueCloudSync();
};

export const loadTeacherBonuses = async (year?: string): Promise<TeacherBonusRow[]> => {
  await ensureCache();
  const userId = await getUserId();
  if (!userId) return [];
  const rows = await getCachedTeacherBonuses();
  return byYear(
    rows.filter((r) => belongsToUser(r, userId)),
    year,
  );
};

export const saveTeacherBonus = async (
  bonus: Partial<TeacherBonusRow> & {
    teacher_name: string;
    year: string;
    month: number;
    amount: number;
  },
): Promise<TeacherBonusRow | null> => {
  guardWrite();
  const userId = await getUserId();
  if (!userId) return null;
  const existing = bonus.id
    ? undefined
    : (await getCachedTeacherBonuses()).find(
        (b) =>
          b.user_id === userId &&
          b.teacher_name === bonus.teacher_name &&
          b.year === bonus.year &&
          b.month === bonus.month,
      );
  const row: TeacherBonusRow = {
    id: bonus.id || existing?.id || newLocalId(),
    user_id: userId,
    teacher_name: bonus.teacher_name,
    year: bonus.year,
    month: bonus.month,
    amount: Number(bonus.amount || 0),
    created_at: bonus.created_at || existing?.created_at,
    updated_at: new Date().toISOString(),
  };
  await putCachedTeacherBonus(row);
  await markDirty("teacher_bonus", "upsert", { id: row.id });
  queueCloudSync();
  return row;
};

export const deleteTeacherBonusLocal = async (id: string) => {
  guardWrite();
  await deleteCachedTeacherBonus(id);
  await markDirty("teacher_bonus", "delete", { id });
  queueCloudSync();
};

export const loadDonors = async (year?: string): Promise<DonorRow[]> => {
  await ensureCache();
  const userId = await getUserId();
  if (!userId) return [];
  const rows = await getCachedDonors();
  return byYear(
    rows.filter((r) => belongsToUser(r, userId)),
    year,
  ).sort((a, b) => a.name.localeCompare(b.name, "ar"));
};

export const saveDonor = async (
  donor: Partial<DonorRow> & {
    year: string;
    name: string;
    donor_type: string;
    pledged_amount: number;
    paid_amount: number;
    phone?: string | null;
    in_kind?: string | null;
    notes?: string | null;
  },
): Promise<DonorRow | null> => {
  guardWrite();
  const userId = await getUserId();
  if (!userId) return null;
  const row: DonorRow = {
    ...donor,
    id: donor.id || newLocalId(),
    user_id: userId,
    phone: donor.phone ?? null,
    in_kind: donor.in_kind ?? null,
    notes: donor.notes ?? null,
    pledged_amount: Number(donor.pledged_amount || 0),
    paid_amount: Number(donor.paid_amount || 0),
    updated_at: new Date().toISOString(),
  };
  await putCachedDonor(row);
  await markDirty("donor", "upsert", { id: row.id });
  queueCloudSync();
  return row;
};

export const deleteDonorLocal = async (id: string) => {
  guardWrite();
  await deleteCachedDonor(id);
  await markDirty("donor", "delete", { id });
  queueCloudSync();
};

export const loadAwards = async (year?: string): Promise<AwardRow[]> => {
  await ensureCache();
  const userId = await getUserId();
  if (!userId) return [];
  const rows = await getCachedAwards();
  return byYear(
    rows.filter((r) => belongsToUser(r, userId)),
    year,
  ).sort((a, b) => (b.awarded_at || "").localeCompare(a.awarded_at || ""));
};

export const saveAward = async (
  award: Partial<AwardRow> & {
    year: string;
    recipient_type: string;
    recipient_name: string;
    award_type: string;
    award_kind: string;
    amount: number;
    item?: string | null;
    student_name?: string | null;
    notes?: string | null;
    awarded_at: string;
    funded_by?: string | null;
  },
): Promise<AwardRow | null> => {
  guardWrite();
  const userId = await getUserId();
  if (!userId) return null;
  const row: AwardRow = {
    ...award,
    id: award.id || newLocalId(),
    user_id: userId,
    amount: Number(award.amount || 0),
    item: award.item ?? null,
    student_name: award.student_name ?? null,
    notes: award.notes ?? null,
    funded_by: award.funded_by ?? null,
    updated_at: new Date().toISOString(),
  };
  await putCachedAward(row);
  await markDirty("award", "upsert", { id: row.id });
  queueCloudSync();
  return row;
};

export const deleteAwardLocal = async (id: string) => {
  guardWrite();
  await deleteCachedAward(id);
  await markDirty("award", "delete", { id });
  queueCloudSync();
};

export const loadCeremonyExpenses = async (year?: string): Promise<CeremonyExpenseRow[]> => {
  await ensureCache();
  const userId = await getUserId();
  if (!userId) return [];
  const rows = await getCachedCeremonyExpenses();
  return byYear(
    rows.filter((r) => belongsToUser(r, userId)),
    year,
  ).sort((a, b) => (b.spent_at || "").localeCompare(a.spent_at || ""));
};

export const saveCeremonyExpense = async (
  expense: Partial<CeremonyExpenseRow> & {
    year: string;
    category: string;
    description: string;
    amount: number;
    spent_at: string;
    funded_by?: string | null;
    notes?: string | null;
  },
): Promise<CeremonyExpenseRow | null> => {
  guardWrite();
  const userId = await getUserId();
  if (!userId) return null;
  const row: CeremonyExpenseRow = {
    ...expense,
    id: expense.id || newLocalId(),
    user_id: userId,
    amount: Number(expense.amount || 0),
    funded_by: expense.funded_by ?? null,
    notes: expense.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  await putCachedCeremonyExpense(row);
  await markDirty("expense", "upsert", { id: row.id });
  queueCloudSync();
  return row;
};

export const deleteCeremonyExpenseLocal = async (id: string) => {
  guardWrite();
  await deleteCachedCeremonyExpense(id);
  await markDirty("expense", "delete", { id });
  queueCloudSync();
};

export const loadCertificates = async (year?: string): Promise<CertificateRow[]> => {
  await ensureCache();
  const userId = await getUserId();
  if (!userId) return [];
  const rows = await getCachedCertificates();
  return byYear(
    rows.filter((r) => belongsToUser(r, userId)),
    year,
  ).sort((a, b) => a.recipient_name.localeCompare(b.recipient_name, "ar"));
};

export const saveCertificate = async (
  certificate: Partial<CertificateRow> & {
    year: string;
    recipient_type: string;
    recipient_name: string;
    cert_type: string;
    title?: string;
    notes?: string | null;
    issued_at: string;
  },
): Promise<CertificateRow | null> => {
  guardWrite();
  const userId = await getUserId();
  if (!userId) return null;
  const row: CertificateRow = {
    ...certificate,
    id: certificate.id || newLocalId(),
    user_id: userId,
    title: certificate.title || "",
    notes: certificate.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  await putCachedCertificate(row);
  await markDirty("certificate", "upsert", { id: row.id });
  queueCloudSync();
  return row;
};

export const saveCertificates = async (
  certificates: Array<Parameters<typeof saveCertificate>[0]>,
) => {
  guardWrite();
  const saved: CertificateRow[] = [];
  for (const certificate of certificates) {
    const row = await saveCertificate(certificate);
    if (row) saved.push(row);
  }
  return saved;
};

export const deleteCertificateLocal = async (id: string) => {
  guardWrite();
  await deleteCachedCertificate(id);
  await markDirty("certificate", "delete", { id });
  queueCloudSync();
};

export const loadMediaMetadata = async (year?: string): Promise<MediaMetadataRow[]> => {
  await ensureCache();
  const userId = await getUserId();
  if (!userId) return [];
  const rows = await getCachedMedia();
  return byYear(
    rows.filter((r) => belongsToUser(r, userId)),
    year,
  ).sort((a, b) => a.month - b.month || (b.created_at || "").localeCompare(a.created_at || ""));
};

export const saveMediaMetadata = async (
  media: Partial<MediaMetadataRow> & {
    year: string;
    month: number;
    title: string;
    file_path: string;
    file_type: "image" | "video";
    file_size: number;
  },
): Promise<MediaMetadataRow | null> => {
  guardWrite();
  const userId = await getUserId();
  if (!userId) return null;
  const row: MediaMetadataRow = {
    ...media,
    id: media.id || newLocalId(),
    user_id: userId,
    created_at: media.created_at || new Date().toISOString(),
  };
  await putCachedMedia(row);
  await markDirty("media", "upsert", { id: row.id });
  queueCloudSync();
  return row;
};

export const deleteMediaMetadataLocal = async (id: string) => {
  guardWrite();
  const existing = (await getCachedMedia()).find((item) => item.id === id);
  await deleteCachedMedia(id);
  await markDirty("media", "delete", { id, file_path: existing?.file_path });
  queueCloudSync();
};

// ===== «الحفظ»: كتابة كل التعديلات المعلقة إلى مجلد قاعدة البيانات الآن =====
export const syncToCloud = async (onProgress?: ProgressCb): Promise<boolean> => {
  if (isViewingOtherUser()) return false;
  try {
    onProgress?.(0, 1, "الحفظ في المجلد");
    await folderDb.flush();
    onProgress?.(1, 1, "اكتمل");
    return true;
  } catch (err) {
    console.error("تعذّر الحفظ في مجلد قاعدة البيانات:", err);
    return false;
  }
};

// Legacy sync-compatible wrappers (for ImportExport component)
export const saveGlobalStudents = async (students: Student[]) => {
  guardWrite();
  // handled per-student via saveStudent
};

// ===== حذف/دمج أسماء الطلاب المكررة (باستخدام التطبيع العربي الموحّد) =====
export const mergeDuplicateStudents = async (): Promise<number> => {
  guardWrite();
  await ensureCache();
  const students = await getCachedStudents();
  const allHistory = await getCachedHifzHistory();
  const allYearData = await getCachedYearData();

  const groups: Record<string, typeof students> = {};
  for (const s of students) {
    const key = normalizeStudentName(s.name);
    if (!key) continue;
    (groups[key] = groups[key] || []).push(s);
  }

  const { putCachedHifzRow, putCachedYearData, deleteItem, deleteCachedStudent } =
    await import("./localDB");
  let mergedCount = 0;

  for (const key in groups) {
    const group = groups[key];
    if (group.length < 2) continue;
    // نحتفظ بالسجل الأقدم (الأصغر معرّفاً) كسجل أساسي وننقل إليه أي بيانات ناقصة
    group.sort((a, b) => a.id - b.id);
    const primary = { ...group[0] };
    const dupes = group.slice(1);
    let primaryUpdated = false;

    for (const dup of dupes) {
      // دمج بيانات ملف الطالب/ة الأساسية إن كانت فارغة في السجل الأساسي
      if (!primary.teacher && dup.teacher) {
        primary.teacher = dup.teacher;
        primaryUpdated = true;
      }
      for (const field of [
        "gender",
        "hijri_join_date",
        "initial_hifz",
        "first_competition_year",
        "school_grade",
        "guardian_phone",
        "student_phone",
        "notes",
      ] as const) {
        if (!primary[field] && dup[field]) {
          primary[field] = dup[field];
          primaryUpdated = true;
        }
      }
      if ((!primary.status || primary.status === "طبيعي") && dup.status && dup.status !== "طبيعي") {
        primary.status = dup.status;
        primaryUpdated = true;
      }
      if (dup.custom_fields && Object.keys(dup.custom_fields).length > 0) {
        primary.custom_fields = {
          ...dup.custom_fields,
          ...(primary.custom_fields || {}),
        };
        primaryUpdated = true;
      }

      // نقل سجل الحفظ التاريخي (مع عدم الكتابة فوق قيم موجودة)
      const dupHistory = allHistory.filter((h) => h.student_id === dup.id);
      for (const h of dupHistory) {
        const existing = allHistory.find(
          (r) => r.student_id === primary.id && r.year_key === h.year_key,
        );
        if (!existing || !existing.value || existing.value === "0") {
          const updatedRow = { student_id: primary.id, year_key: h.year_key, value: h.value };
          await putCachedHifzRow(updatedRow);
          if (existing) existing.value = h.value;
          else allHistory.push(updatedRow);
          await markDirty("hifz", "upsert", { student_id: primary.id, year_key: h.year_key });
        }
        await deleteItem("hifz_history", [h.student_id, h.year_key]);
        await clearPending(`hifz:${h.student_id}|${h.year_key}`);
      }

      // نقل بيانات الأعوام
      const dupYears = allYearData.filter((y) => y.student_id === dup.id);
      for (const y of dupYears) {
        const existing = allYearData.find((r) => r.student_id === primary.id && r.year === y.year);
        if (!existing || (!existing.parts && (!existing.total || existing.total === "0"))) {
          const updatedYear = {
            ...y,
            student_id: primary.id,
            teacher: y.teacher || existing?.teacher || primary.teacher || "",
          };
          await putCachedYearData(updatedYear);
          if (existing) Object.assign(existing, updatedYear);
          else allYearData.push(updatedYear);
          await markDirty("year", "upsert", { student_id: primary.id, year: y.year });
        }
        await deleteItem("year_data", [y.student_id, y.year]);
        await clearPending(`year:${y.student_id}|${y.year}`);
      }

      // حذف السجل المكرر
      await deleteCachedStudent(dup.id);
      await clearPending(`student:${dup.id}`);
      await markDirty("student", "delete", { id: dup.id });
      mergedCount++;
    }

    if (primaryUpdated) {
      await putCachedStudent(primary);
      await markDirty("student", "upsert", { id: primary.id });
    }
  }

  const userId = await getUserId();
  if (mergedCount > 0 && canUseCloud(userId)) {
    await syncToCloud();
  }

  return mergedCount;
};

export const deleteDuplicateStudents = mergeDuplicateStudents;

// ================= المتابعة الشهرية =================
// جدول monthly_tracking في قاعدة بيانات المجلد المحلية (عبر العميل المحلي
// بنفس واجهة Supabase) — يعمل بدون إنترنت.

import { MonthlyRecord, QuranPoint, TRACKING_MONTHS } from "@/types/student";
import { calcPagesBetweenAsync } from "@/utils/quranData";

const emptyPoint = (): QuranPoint => ({ surah: null, ayah: null });

const emptyMonthlyRecord = (): MonthlyRecord => ({
  memoFrom: emptyPoint(),
  memoTo: emptyPoint(),
  memoHifzScore: "",
  memoRecitationScore: "",
  reviewFrom: emptyPoint(),
  reviewTo: emptyPoint(),
  reviewHifzScore: "",
  reviewRecitationScore: "",
  attendanceScore: "",
  behaviorScore: "",
});

const rowToRecord = (row: MonthlyTrackingRow): MonthlyRecord => ({
  memoFrom: {
    surah: row.memorization_from_surah ?? null,
    ayah: row.memorization_from_ayah ?? null,
  },
  memoTo: { surah: row.memorization_to_surah ?? null, ayah: row.memorization_to_ayah ?? null },
  memoHifzScore: row.memorization_hifz_score?.toString() || "",
  memoRecitationScore: row.memorization_recitation_score?.toString() || "",
  reviewFrom: { surah: row.review_from_surah ?? null, ayah: row.review_from_ayah ?? null },
  reviewTo: { surah: row.review_to_surah ?? null, ayah: row.review_to_ayah ?? null },
  reviewHifzScore: row.review_hifz_score?.toString() || "",
  reviewRecitationScore: row.review_recitation_score?.toString() || "",
  attendanceScore: row.attendance_score?.toString() || "",
  behaviorScore: row.behavior_score?.toString() || "",
});

// يحمّل سجل شهر واحد لكل الطلاب والطالبات لعام معيّن (لعرض جدول شهر بعينه)
export const loadMonthlyTrackingForMonth = async (
  year: string,
  month: number,
): Promise<Record<number, MonthlyRecord>> => {
  const userId = await getUserId();
  const result: Record<number, MonthlyRecord> = {};
  if (!canUseCloud(userId)) return result;

  const { data, error } = await supabase
    .from("monthly_tracking")
    .select("*")
    .eq("user_id", userId)
    .eq("year", year)
    .eq("month", month);

  if (error) {
    console.error("loadMonthlyTrackingForMonth failed:", error);
    return result;
  }

  (data || []).forEach((row) => {
    result[row.student_id] = rowToRecord(row);
  });
  return result;
};

// يحمّل كل الأشهر (1-9) لطالب/طالبة واحدة خلال عام معيّن (لعرض بطاقتها الكاملة)
export const loadMonthlyTrackingForStudent = async (
  year: string,
  studentId: number,
): Promise<Record<number, MonthlyRecord>> => {
  const userId = await getUserId();
  const result: Record<number, MonthlyRecord> = {};
  if (!canUseCloud(userId)) return result;

  const { data, error } = await supabase
    .from("monthly_tracking")
    .select("*")
    .eq("user_id", userId)
    .eq("year", year)
    .eq("student_id", studentId);

  if (error) {
    console.error("loadMonthlyTrackingForStudent failed:", error);
    return result;
  }

  (data || []).forEach((row) => {
    result[row.month] = rowToRecord(row);
  });
  return result;
};

// يجيب "إلى" آخر شهر مسبوق فيه بيانات لهذا الطالب/الطالبة (لكلا القسمين)
// حتى تُستخدم تلقائياً كنقطة بداية ("من") للشهر الحالي
export const getPreviousMonthEndPoints = async (
  year: string,
  studentId: number,
  beforeMonth: number,
): Promise<{ memoFrom: QuranPoint; reviewFrom: QuranPoint }> => {
  const all = await loadMonthlyTrackingForStudent(year, studentId);
  for (let m = beforeMonth - 1; m >= 1; m--) {
    const rec = all[m];
    if (rec && (rec.memoTo.surah || rec.reviewTo.surah)) {
      return {
        memoFrom: rec.memoTo.surah ? rec.memoTo : emptyPoint(),
        reviewFrom: rec.reviewTo.surah ? rec.reviewTo : emptyPoint(),
      };
    }
  }
  return { memoFrom: emptyPoint(), reviewFrom: emptyPoint() };
};

// يحفظ سجل شهر واحد لطالب/طالبة، ثم يعيد احتساب الإجماليات السنوية تلقائياً
// ويحدّث "حفظ جديد" و"السنوية" بالجدول الرئيسي (year_data) — مع بقائها
// قابلة للتعديل اليدوي لاحقاً (مثلاً لإضافة حفظ إضافي بعطلة رمضان قبل المسابقة).
export const saveMonthlyRecord = async (
  year: string,
  studentId: number,
  month: number,
  record: MonthlyRecord,
): Promise<boolean> => {
  guardWrite();
  const userId = await getUserId();
  if (!canUseCloud(userId)) return false;

  const { error } = await supabase.from("monthly_tracking").upsert(
    {
      user_id: userId,
      student_id: studentId,
      year,
      month,
      memorization_from_surah: record.memoFrom.surah,
      memorization_from_ayah: record.memoFrom.ayah,
      memorization_to_surah: record.memoTo.surah,
      memorization_to_ayah: record.memoTo.ayah,
      memorization_hifz_score: parseFloat(record.memoHifzScore) || 0,
      memorization_recitation_score: parseFloat(record.memoRecitationScore) || 0,
      review_from_surah: record.reviewFrom.surah,
      review_from_ayah: record.reviewFrom.ayah,
      review_to_surah: record.reviewTo.surah,
      review_to_ayah: record.reviewTo.ayah,
      review_hifz_score: parseFloat(record.reviewHifzScore) || 0,
      review_recitation_score: parseFloat(record.reviewRecitationScore) || 0,
      attendance_score: parseFloat(record.attendanceScore) || 0,
      behavior_score: parseFloat(record.behaviorScore) || 0,
    },
    { onConflict: "student_id,year,month" },
  );

  if (error) {
    console.error("saveMonthlyRecord failed:", error);
    return false;
  }

  await recomputeAnnualFromMonthly(year, studentId);
  return true;
};

// يعيد احتساب "حفظ جديد" (من مجموع أوجه قسم الحفظ المحسوبة تلقائياً ÷ 20)
// و"السنوية" (متوسط السلوك+المواظبة الشهري من 20) من كل سجلات المتابعة
// الشهرية للطالب/طالبة، ويكتبها بجدول بيانات العام الرئيسي (year_data) — القيم
// تبقى قابلة للتعديل اليدوي بعدها (مثلاً لإضافة حفظ إضافي بعطلة رمضان).
export const recomputeAnnualFromMonthly = async (year: string, studentId: number) => {
  guardWrite();
  const userId = await getUserId();
  if (!canUseCloud(userId)) return;

  const { data, error } = await supabase
    .from("monthly_tracking")
    .select("*")
    .eq("user_id", userId)
    .eq("year", year)
    .eq("student_id", studentId);

  if (error || !data) return;

  const pagesPerRow = await Promise.all(
    data.map(async (r) => {
      if (!r.memorization_from_surah || !r.memorization_to_surah) return 0;
      return calcPagesBetweenAsync(
        r.memorization_from_surah,
        r.memorization_from_ayah || 0,
        r.memorization_to_surah,
        r.memorization_to_ayah || 0,
      );
    }),
  );
  const totalPages = pagesPerRow.reduce((sum, p) => sum + p, 0);

  const monthsWithScores = data.filter(
    (r) => (Number(r.attendance_score) || 0) > 0 || (Number(r.behavior_score) || 0) > 0,
  );
  const totalMonthlyOutOf20 = data.reduce(
    (sum: number, r) => sum + ((Number(r.attendance_score) || 0) + (Number(r.behavior_score) || 0)),
    0,
  );
  const monthCount = monthsWithScores.length || 1;

  const partsFromPages = totalPages / 20; // 20 وجه = جزء
  const annualScore = totalMonthlyOutOf20 / monthCount; // متوسط من 20

  const existing = await loadYearData(year, studentId);
  await saveYearData(year, studentId, {
    ...existing,
    parts: partsFromPages > 0 ? partsFromPages.toFixed(2).replace(/\.00$/, "") : existing.parts,
    annual: totalMonthlyOutOf20 > 0 ? annualScore.toFixed(2).replace(/\.00$/, "") : existing.annual,
  });
  // ادفع التحديث للسحابة فوراً حتى ينعكس بالجدول الرئيسي من أي جهاز آخر مباشرة
  await syncToCloud();
};

// ===== إحصائيات الحفظ والمراجعة (منفصلة عن درجات المسابقة الرمضانية) =====
// تُستخدم لترشيح: أفضل طالب/ة بالحفظ خلال شهر معيّن، وأفضل طالب/ة بالمراجعة
export interface MonthlyRanking {
  studentId: number;
  memoScore: number; // تسميع الحفظ + تلاوة الحفظ (من 40)
  reviewScore: number; // تسميع المراجعة + تلاوة المراجعة (من 40)
  pagesThisMonth: number;
}

export const getMonthlyRankings = async (
  year: string,
  month: number,
): Promise<MonthlyRanking[]> => {
  const userId = await getUserId();
  if (!canUseCloud(userId)) return [];

  const { data, error } = await supabase
    .from("monthly_tracking")
    .select("*")
    .eq("user_id", userId)
    .eq("year", year)
    .eq("month", month);

  if (error || !data) return [];

  return Promise.all(
    data.map(async (r) => ({
      studentId: r.student_id,
      memoScore:
        (Number(r.memorization_hifz_score) || 0) + (Number(r.memorization_recitation_score) || 0),
      reviewScore: (Number(r.review_hifz_score) || 0) + (Number(r.review_recitation_score) || 0),
      pagesThisMonth:
        r.memorization_from_surah && r.memorization_to_surah
          ? await calcPagesBetweenAsync(
              r.memorization_from_surah,
              r.memorization_from_ayah || 0,
              r.memorization_to_surah,
              r.memorization_to_ayah || 0,
            )
          : 0,
    })),
  );
};

// يجيب آخر عام وشهر تم تسجيل متابعة فيهما فعلياً (لأي طالب/طالبة)، لفتح صفحة
// المتابعة الشهرية تلقائياً على آخر نقطة توقف عندها العمل، بدل قيمة ثابتة
export const getLatestTrackedPeriod = async (): Promise<{ year: string; month: number } | null> => {
  const userId = await getUserId();
  if (!canUseCloud(userId)) return null;

  const { data, error } = await supabase
    .from("monthly_tracking")
    .select("year, month")
    .eq("user_id", userId)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return { year: data[0].year, month: data[0].month };
};

export { TRACKING_MONTHS };

// ===== كشف الخاتمين والخاتمات =====
// يجمع كل الطلاب والطالبات اللي ختمن القرآن الكريم (30 جزء) بكل الأعوام، من كل
// سجلات year_data — يتحدّث تلقائياً كل ما طالب/طالبة جديدة تختم بأي عام
export interface KhatimEntry {
  studentId: number;
  name: string;
  teacher: string;
  year: string;
  totalScore: string;
  grade: string;
}

// يتحقق هل اسم معيّن مسجّل مسبقاً لطالب/طالبة أخرى (باستثناء رقم الطالب/الطالبة الحالية
// نفسها)، ويرجع الأعوام اللي هي مسجّلة فيها فعلياً — يُستخدم لمنع إضافة
// طالب/طالبة "جديدة" بنفس اسم طالب/طالبة موجودة مسبقاً بعام سابق بالغلط
export const checkGlobalDuplicateName = async (
  name: string,
  excludeId?: number,
): Promise<{ studentId: number; years: string[] } | null> => {
  const userId = await getUserId();
  if (!canUseCloud(userId)) return null;

  const normalized = (name || "").trim().replace(/\s+/g, " ");
  if (!normalized) return null;

  const { data: matches, error } = await supabase
    .from("students")
    .select("id, name")
    .eq("user_id", userId)
    .ilike("name", normalized);

  if (error || !matches) return null;

  const match = matches.find((m) => {
    const mNorm = (m.name || "").trim().replace(/\s+/g, " ");
    return mNorm.toLowerCase() === normalized.toLowerCase() && m.id !== excludeId;
  });
  if (!match) return null;

  const { data: yearsData } = await supabase
    .from("year_data")
    .select("year")
    .eq("user_id", userId)
    .eq("student_id", match.id);

  const years = Array.from(new Set((yearsData || []).map((r) => r.year))).sort();
  return { studentId: match.id, years };
};

export const loadKhatimat = async (): Promise<KhatimEntry[]> => {
  const userId = await getUserId();
  if (!canUseCloud(userId)) return [];

  const { data, error } = await supabase
    .from("year_data")
    .select("student_id, year, total_hifz, total, grade, teacher, students(name)")
    .eq("user_id", userId);

  if (error || !data) {
    console.error("loadKhatimat failed:", error);
    return [];
  }

  return data
    .filter((r) => (parseFloat(r.total_hifz) || 0) >= 30)
    .map((r) => ({
      studentId: r.student_id,
      name: r.students?.name || "",
      teacher: r.teacher || "",
      year: r.year,
      totalScore: r.total || "0",
      grade: r.grade || "",
    }))
    .sort((a, b) => a.year.localeCompare(b.year) || a.name.localeCompare(b.name, "ar"));
};
