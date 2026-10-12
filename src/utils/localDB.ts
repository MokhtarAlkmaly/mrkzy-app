/**
 * طبقة التخزين المحلي — النسخة التي تعمل بدون إنترنت.
 *
 * كانت هذه الطبقة «كاشاً» (SQLite) يتزامن مع السحابة. في هذه النسخة لا توجد
 * سحابة: الدوال نفسها (بنفس الأسماء والتوقيعات حتى لا يتغير storage.ts
 * والصفحات) تقرأ وتكتب مباشرة في قاعدة بيانات المجلد (src/offline) — أي
 * في ملفات JSON داخل المجلد الذي اختاره المستخدم على الهاتف أو بطاقة SD.
 *
 * دوال «التغييرات المعلقة» (markDirty...) لم يعد لها معنى (لا يوجد شيء
 * يُرفع)، فأصبحت بلا عمل وتبقى فقط للتوافق.
 */

import { db } from "@/offline/dbManager";
import { cloneRow } from "@/offline/folderDb";
import { valuesEqual } from "@/offline/query";
import type { Row } from "@/offline/schema";

type SqlValue = string | number | boolean | null;

/** اسم «المخزن» القديم → الجدول المحلي وأعمدة التعريف المستخدمة في هذه الطبقة. */
const STORES: Record<string, { table: string; key: string[] }> = {
  students: { table: "students", key: ["id"] },
  hifz_history: { table: "hifz_history", key: ["student_id", "year_key"] },
  year_data: { table: "year_data", key: ["student_id", "year"] },
  settings: { table: "app_settings", key: ["key"] },
  teachers: { table: "teachers", key: ["id"] },
  teacher_bonuses: { table: "teacher_bonuses", key: ["id"] },
  donors: { table: "donors", key: ["id"] },
  awards: { table: "awards", key: ["id"] },
  ceremony_expenses: { table: "ceremony_expenses", key: ["id"] },
  certificates: { table: "certificates", key: ["id"] },
  media: { table: "media", key: ["id"] },
};

const resolveStore = (storeName: string) => {
  const store = STORES[storeName];
  if (!store) throw new Error(`localDB: مخزن غير معروف "${storeName}"`);
  return store;
};

const keyValues = (key: SqlValue | SqlValue[]): SqlValue[] => (Array.isArray(key) ? key : [key]);

const matchKey = (cols: string[], values: unknown[]) => (row: Row) =>
  cols.every((c, i) => valuesEqual(row[c], values[i]));

// ========== دوال CRUD العامة (نفس التوقيعات السابقة) ==========

export const putItem = async (storeName: string, item: object) => {
  const { table, key } = resolveStore(storeName);
  const input = { ...(item as Row) };
  // الجداول المعرّفة بغير id (سجل الحفظ، بيانات الأعوام، الإعدادات): المعرّف
  // الداخلي والطوابع الزمنية تديرها قاعدة البيانات، لا هذه الطبقة.
  if (!key.includes("id")) {
    delete input.id;
    delete input.created_at;
  }
  delete input.updated_at;
  const values = key.map((k) => input[k]);
  const rows = db.rowsRef(table);
  const existing = rows.find(matchKey(key, values));
  if (existing) {
    db.updateRows(table, (r) => r === existing, input);
  } else {
    db.insertRows(table, [input]);
  }
};

export const getItem = async <T>(
  storeName: string,
  key: SqlValue | SqlValue[],
): Promise<T | undefined> => {
  const { table, key: cols } = resolveStore(storeName);
  const row = db.rowsRef(table).find(matchKey(cols, keyValues(key)));
  return row ? (cloneRow(row) as T) : undefined;
};

export const getAllItems = async <T>(storeName: string): Promise<T[]> => {
  const { table } = resolveStore(storeName);
  return db.all(table) as T[];
};

export const deleteItem = async (storeName: string, key: SqlValue | SqlValue[]) => {
  const { table, key: cols } = resolveStore(storeName);
  // حذف الطالب/ة يحذف تلقائياً سجلاته المرتبطة (CASCADE) كما في PostgreSQL.
  db.deleteRows(table, matchKey(cols, keyValues(key)));
};

export const clearStore = async (storeName: string) => {
  const { table } = resolveStore(storeName);
  db.deleteRows(table, () => true);
};

/** استبدال كامل محتوى جدول دفعة واحدة. */
const cacheRecords = async <T extends object>(storeName: string, rows: T[]) => {
  const { table } = resolveStore(storeName);
  db.deleteRows(table, () => true);
  if (rows.length > 0) db.insertRows(table, rows as Row[]);
};

// ========== Students ==========

export interface CachedStudent {
  id: number;
  name: string;
  teacher: string;
  user_id: string;
  gender?: string | null;
  hijri_join_date?: string | null;
  initial_hifz?: string | null;
  first_competition_year?: string | null;
  status?: string | null;
  school_grade?: string | null;
  guardian_phone?: string | null;
  student_phone?: string | null;
  custom_fields?: Record<string, string>;
  notes?: string | null;
}

export const cacheStudents = async (students: CachedStudent[]) =>
  cacheRecords("students", students);
export const getCachedStudents = () => getAllItems<CachedStudent>("students");
export const deleteCachedStudent = (id: number) => deleteItem("students", id);
export const putCachedStudent = (student: CachedStudent) => putItem("students", student);

// ========== Hifz History ==========

export interface CachedHifzRow {
  student_id: number;
  year_key: string;
  value: string;
}

export const cacheHifzHistory = async (rows: CachedHifzRow[]) => cacheRecords("hifz_history", rows);
export const getCachedHifzHistory = () => getAllItems<CachedHifzRow>("hifz_history");
export const putCachedHifzRow = (row: CachedHifzRow) => putItem("hifz_history", row);

// ========== Year Data ==========

export interface CachedYearData {
  student_id: number;
  year: string;
  base_hifz: string;
  total_hifz: string;
  parts: string;
  annual: string;
  recitation: string;
  memorization: string;
  total: string;
  grade: string;
  prize: string;
  status_prize: string;
  rank: string;
  teacher: string;
}

export const cacheYearData = async (rows: CachedYearData[]) => cacheRecords("year_data", rows);
export const getCachedYearData = () => getAllItems<CachedYearData>("year_data");
export const putCachedYearData = (row: CachedYearData) => putItem("year_data", row);

// ========== Teachers ==========

export interface CachedTeacher {
  id: string;
  user_id: string;
  year: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export const cacheTeachers = (rows: CachedTeacher[]) => cacheRecords("teachers", rows);
export const getCachedTeachers = () => getAllItems<CachedTeacher>("teachers");
export const getCachedTeacher = (id: string) => getItem<CachedTeacher>("teachers", id);
export const putCachedTeacher = (row: CachedTeacher) => putItem("teachers", row);
export const deleteCachedTeacher = (id: string) => deleteItem("teachers", id);

// ========== Teacher Bonuses ==========

export interface CachedTeacherBonus {
  id: string;
  user_id: string;
  teacher_name: string;
  year: string;
  month: number;
  amount: number;
  created_at?: string;
  updated_at?: string;
}

export const cacheTeacherBonuses = (rows: CachedTeacherBonus[]) =>
  cacheRecords("teacher_bonuses", rows);
export const getCachedTeacherBonuses = () => getAllItems<CachedTeacherBonus>("teacher_bonuses");
export const getCachedTeacherBonus = (id: string) =>
  getItem<CachedTeacherBonus>("teacher_bonuses", id);
export const putCachedTeacherBonus = (row: CachedTeacherBonus) => putItem("teacher_bonuses", row);
export const deleteCachedTeacherBonus = (id: string) => deleteItem("teacher_bonuses", id);

// ========== Donors ==========

export interface CachedDonor {
  id: string;
  user_id: string;
  year: string;
  name: string;
  donor_type: string;
  phone: string | null;
  pledged_amount: number;
  paid_amount: number;
  in_kind: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export const cacheDonors = (rows: CachedDonor[]) => cacheRecords("donors", rows);
export const getCachedDonors = () => getAllItems<CachedDonor>("donors");
export const getCachedDonor = (id: string) => getItem<CachedDonor>("donors", id);
export const putCachedDonor = (row: CachedDonor) => putItem("donors", row);
export const deleteCachedDonor = (id: string) => deleteItem("donors", id);

// ========== Awards ==========

export interface CachedAward {
  id: string;
  user_id: string;
  year: string;
  recipient_type: string;
  recipient_name: string;
  award_type: string;
  award_kind: string;
  amount: number;
  item: string | null;
  student_name: string | null;
  notes: string | null;
  awarded_at: string;
  funded_by: string | null;
  created_at?: string;
  updated_at?: string;
}

export const cacheAwards = (rows: CachedAward[]) => cacheRecords("awards", rows);
export const getCachedAwards = () => getAllItems<CachedAward>("awards");
export const getCachedAward = (id: string) => getItem<CachedAward>("awards", id);
export const putCachedAward = (row: CachedAward) => putItem("awards", row);
export const deleteCachedAward = (id: string) => deleteItem("awards", id);

// ========== Ceremony Expenses ==========

export interface CachedCeremonyExpense {
  id: string;
  user_id: string;
  year: string;
  category: string;
  description: string;
  amount: number;
  spent_at: string;
  funded_by: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export const cacheCeremonyExpenses = (rows: CachedCeremonyExpense[]) =>
  cacheRecords("ceremony_expenses", rows);
export const getCachedCeremonyExpenses = () =>
  getAllItems<CachedCeremonyExpense>("ceremony_expenses");
export const getCachedCeremonyExpense = (id: string) =>
  getItem<CachedCeremonyExpense>("ceremony_expenses", id);
export const putCachedCeremonyExpense = (row: CachedCeremonyExpense) =>
  putItem("ceremony_expenses", row);
export const deleteCachedCeremonyExpense = (id: string) => deleteItem("ceremony_expenses", id);

// ========== Certificates ==========

export interface CachedCertificate {
  id: string;
  user_id: string;
  year: string;
  recipient_type: string;
  recipient_name: string;
  cert_type: string;
  title: string;
  notes: string | null;
  issued_at: string;
  created_at?: string;
  updated_at?: string;
}

export const cacheCertificates = (rows: CachedCertificate[]) => cacheRecords("certificates", rows);
export const getCachedCertificates = () => getAllItems<CachedCertificate>("certificates");
export const getCachedCertificate = (id: string) => getItem<CachedCertificate>("certificates", id);
export const putCachedCertificate = (row: CachedCertificate) => putItem("certificates", row);
export const deleteCachedCertificate = (id: string) => deleteItem("certificates", id);

// ========== Media Metadata ==========

export interface CachedMedia {
  id: string;
  user_id: string;
  year: string;
  month: number;
  title: string;
  file_path: string;
  file_type: "image" | "video";
  file_size: number;
  created_at?: string;
}

export const cacheMedia = (rows: CachedMedia[]) => cacheRecords("media", rows);
export const getCachedMedia = () => getAllItems<CachedMedia>("media");
export const getCachedMediaItem = (id: string) => getItem<CachedMedia>("media", id);
export const putCachedMedia = (row: CachedMedia) => putItem("media", row);
export const deleteCachedMedia = (id: string) => deleteItem("media", id);

// ========== Settings (مفتاح/قيمة في جدول app_settings) ==========

export const setCachedSetting = async (key: string, value: unknown) => {
  await putItem("settings", { key, value: value === undefined ? null : value });
};

export const getCachedSetting = async <T>(key: string): Promise<T | undefined> => {
  const item = await getItem<{ key: string; value: T | null }>("settings", key);
  return item?.value ?? undefined;
};

// ========== Meta ==========

/** لا توجد مزامنة: «آخر مزامنة» = آخر حفظ ناجح في المجلد. */
export const setLastSyncTime = async () => {};

export const getLastSyncTime = async (): Promise<number | null> => db.status.lastSavedAt;

/** البيانات المحلية هي المصدر الوحيد — جاهزة دائماً متى كانت قاعدة البيانات مفتوحة. */
export const isCachePopulated = async (): Promise<boolean> => db.isOpen();

// ========== Clear all ==========

/** يمسح كل جداول هذه الطبقة (لا يُستدعى تلقائياً أبداً في النسخة المحلية). */
export const clearAllCache = async () => {
  for (const { table } of Object.values(STORES)) db.deleteRows(table, () => true);
};

// ========== التغييرات المعلقة (لم يعد لها عمل — لا توجد سحابة) ==========

export type PendingOp = "upsert" | "delete";
export type PendingEntity =
  | "student"
  | "hifz"
  | "year"
  | "teacher"
  | "teacher_bonus"
  | "donor"
  | "award"
  | "expense"
  | "certificate"
  | "media";

export interface PendingRef {
  id?: number | string;
  student_id?: number;
  year_key?: string;
  year?: string;
  file_path?: string;
}

export interface PendingChange {
  key: string;
  entity: PendingEntity;
  op: PendingOp;
  ref: PendingRef;
  ts: number;
}

export const markDirty = async (_entity: PendingEntity, _op: PendingOp, _ref: PendingRef) => {};

export const getPendingChanges = async (): Promise<PendingChange[]> => [];

export const clearPending = async (_key: string) => {};

export const clearAllPending = async () => {};

export const remapPendingStudentId = async (_oldId: number, _newId: number) => {};

// ========== استعلامات إضافية ==========

/** بحث بالاسم داخل الطلاب والطالبات. */
export const searchCachedStudentsByName = async (query: string): Promise<CachedStudent[]> => {
  const q = query.trim();
  return (db.all("students") as unknown as CachedStudent[])
    .filter((s) => (s.name || "").includes(q))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
};

/** بيانات كل الأعوام لطالب/ة واحد/ة. */
export const getCachedYearDataForStudent = async (studentId: number): Promise<CachedYearData[]> =>
  (db.all("year_data") as unknown as CachedYearData[])
    .filter((r) => valuesEqual(r.student_id, studentId))
    .sort((a, b) => a.year.localeCompare(b.year));
