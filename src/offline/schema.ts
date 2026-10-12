/**
 * مخطط قاعدة البيانات المحلية.
 *
 * نفس جداول وأعمدة مخطط Supabase الأصلي (راجع DATABASE.md و
 * supabase/migrations) حتى تبقى شاشات التطبيق تعمل كما هي، مع إضافة جدول
 * محلي واحد: `app_settings` (مفتاح/قيمة لإعدادات العرض).
 *
 * لكل جدول: المفتاح الأساسي، طريقة توليد المعرّف، القيم الافتراضية،
 * القيود الفريدة (لـ upsert ومنع التكرار)، والمفاتيح الأجنبية مع الحذف
 * المتسلسل (ON DELETE CASCADE) تماماً كما في PostgreSQL.
 */

import { LOCAL_USER_ID } from "./constants";

export type Row = Record<string, unknown>;

export type OnDelete = "cascade" | "set null";

export interface ForeignKey {
  /** العمود في هذا الجدول. */
  column: string;
  /** الجدول المشار إليه. */
  table: string;
  /** العمود المشار إليه (عادة id). */
  refColumn: string;
  onDelete: OnDelete;
}

export interface UniqueConstraint {
  name: string;
  columns: string[];
  /** قيد جزئي (WHERE ...) — يُطبَّق القيد فقط على الصفوف التي تحقق الشرط. */
  where?: (row: Row) => boolean;
}

export interface TableDef {
  name: string;
  /** اسم عربي يظهر في شاشة «قاعدة البيانات». */
  label: string;
  primaryKey: string[];
  /** توليد المعرّف تلقائياً عند الإدراج (uuid أو رقم تسلسلي). */
  autoId?: "uuid" | "serial";
  createdAt?: boolean;
  updatedAt?: boolean;
  /** للجداول التي فيها user_id (يُملأ تلقائياً بالمستخدم المحلي). */
  userScoped?: boolean;
  defaults?: Record<string, () => unknown>;
  unique?: UniqueConstraint[];
  foreignKeys?: ForeignKey[];
}

/** تاريخ اليوم بالتوقيت المحلي بصيغة YYYY-MM-DD (مقابل CURRENT_DATE). */
export const todayDate = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const v =
  <T>(value: T) =>
  () =>
    value;
const emptyObject = () => ({});
const emptyArray = () => [];

const studentFk = (onDelete: OnDelete = "cascade"): ForeignKey => ({
  column: "student_id",
  table: "students",
  refColumn: "id",
  onDelete,
});

export const TABLES: TableDef[] = [
  {
    name: "students",
    label: "الطلاب والطالبات",
    primaryKey: ["id"],
    autoId: "serial",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: { name: v(""), teacher: v(""), custom_fields: emptyObject },
  },
  {
    name: "year_data",
    label: "بيانات الأعوام والدرجات",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: {
      base_hifz: v("0"),
      total_hifz: v("0"),
      parts: v(""),
      annual: v(""),
      recitation: v(""),
      memorization: v(""),
      total: v("0"),
      grade: v(""),
      prize: v("0"),
      status_prize: v(""),
      rank: v("-"),
      teacher: v(""),
    },
    unique: [{ name: "year_data_student_id_year_key", columns: ["student_id", "year"] }],
    foreignKeys: [studentFk()],
  },
  {
    name: "hifz_history",
    label: "سجل الحفظ السابق",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    userScoped: true,
    defaults: { value: v("0") },
    unique: [{ name: "hifz_history_student_id_year_key_key", columns: ["student_id", "year_key"] }],
    foreignKeys: [studentFk()],
  },
  {
    name: "monthly_tracking",
    label: "المتابعة الشهرية",
    // بلا عمود id — المفتاح مركّب كما في السحابة.
    primaryKey: ["student_id", "year", "month"],
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: {
      memorization_hifz_score: v(0),
      memorization_recitation_score: v(0),
      review_hifz_score: v(0),
      review_recitation_score: v(0),
      attendance_score: v(0),
      behavior_score: v(0),
    },
    // في السحابة لا يوجد FK هنا (فتبقى صفوف يتيمة)؛ محلياً نحذفها مع الطالب/ة.
    foreignKeys: [studentFk()],
  },
  {
    name: "teachers",
    label: "المعلمون والمعلمات",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    unique: [{ name: "teachers_user_id_year_name_key", columns: ["user_id", "year", "name"] }],
  },
  {
    name: "teacher_bonuses",
    label: "إكراميات المعلمين",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: { amount: v(0) },
    unique: [
      {
        name: "teacher_bonuses_user_id_teacher_name_year_month_key",
        columns: ["user_id", "teacher_name", "year", "month"],
      },
    ],
  },
  {
    name: "teacher_portals",
    label: "روابط المعلمين والمعلمات",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: { active: v(true) },
    unique: [{ name: "teacher_portals_code_key", columns: ["code"] }],
  },
  {
    name: "monthly_submissions",
    label: "وارد المعلمين والمعلمات",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: {
      memorization_hifz_score: v(0),
      memorization_recitation_score: v(0),
      review_hifz_score: v(0),
      review_recitation_score: v(0),
      attendance_score: v(0),
      behavior_score: v(0),
      status: v("pending"),
      source: v("portal"),
      portal_id: v(null),
      code: v(null),
    },
    unique: [
      { name: "monthly_submissions_portal_student_key", columns: ["portal_id", "student_id"] },
      {
        name: "monthly_submissions_manual_key",
        columns: ["user_id", "student_id", "year", "month"],
        where: (row) => row.portal_id === null || row.portal_id === undefined,
      },
    ],
    foreignKeys: [
      { column: "portal_id", table: "teacher_portals", refColumn: "id", onDelete: "cascade" },
      studentFk(),
    ],
  },
  {
    name: "awards",
    label: "التكريم والجوائز",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: { award_kind: v("cash"), amount: v(0), awarded_at: todayDate },
  },
  {
    name: "certificates",
    label: "الشهادات",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: {
      recipient_type: v("student"),
      cert_type: v("khatm"),
      title: v(""),
      issued_at: todayDate,
    },
  },
  {
    name: "donors",
    label: "الداعمون",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: { donor_type: v("person"), pledged_amount: v(0), paid_amount: v(0) },
  },
  {
    name: "ceremony_expenses",
    label: "المصروفات",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: { category: v("supplies"), description: v(""), amount: v(0), spent_at: todayDate },
  },
  {
    name: "student_competitions",
    label: "المسابقات الداخلية والخارجية",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: {
      competition_type: v("internal"),
      title: v(""),
      rank: v(""),
      score: v(""),
      held_at: todayDate,
    },
  },
  {
    name: "exam_questions",
    label: "بنك أسئلة الاختبارات",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: {
      year: v(""),
      subject: v(""),
      question_type: v("mcq"),
      question: v(""),
      choices: emptyArray,
      difficulty: v("متوسط"),
      category: v(""),
    },
  },
  {
    name: "media",
    label: "بيانات الصور والفيديوهات",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    userScoped: true,
    defaults: { title: v(""), file_size: v(0) },
  },
  {
    name: "trainees",
    label: "المتدربون والمتدربات",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: { gender: v("female") },
  },
  {
    name: "training_courses",
    label: "الدورات التدريبية",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: { category: v("أخرى"), status: v("active") },
  },
  {
    name: "training_enrollments",
    label: "التسجيل في الدورات",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    userScoped: true,
    defaults: { status: v("enrolled"), enrolled_at: todayDate },
    unique: [
      {
        name: "training_enrollments_trainee_id_course_id_key",
        columns: ["trainee_id", "course_id"],
      },
    ],
    foreignKeys: [
      { column: "trainee_id", table: "trainees", refColumn: "id", onDelete: "cascade" },
      { column: "course_id", table: "training_courses", refColumn: "id", onDelete: "cascade" },
    ],
  },
  {
    name: "user_settings",
    label: "إعدادات المركز",
    primaryKey: ["id"],
    autoId: "uuid",
    createdAt: true,
    updatedAt: true,
    userScoped: true,
    defaults: {
      active_year: v("1447"),
      table_filters: emptyObject,
      center_name: v(""),
      teacher_signature: v(""),
      supervisor_signature: v(""),
      manager_signature: v(""),
      student_custom_columns: emptyArray,
      student_statuses: emptyArray,
    },
    unique: [{ name: "user_settings_user_id_key", columns: ["user_id"] }],
  },
  {
    name: "profiles",
    label: "الملف الشخصي",
    primaryKey: ["id"],
    createdAt: true,
    updatedAt: true,
    defaults: { id: v(LOCAL_USER_ID), email: v(null), display_name: v(null) },
  },
  {
    name: "app_settings",
    label: "تفضيلات العرض",
    // جدول محلي فقط (مفتاح/قيمة): العام النشط، مرشّحات الجدول، الحالات، الأعمدة المخصصة.
    primaryKey: ["key"],
  },
];

export const TABLE_NAMES = TABLES.map((t) => t.name);

const TABLE_MAP = new Map(TABLES.map((t) => [t.name, t]));

export const getTableDef = (name: string): TableDef => {
  const def = TABLE_MAP.get(name);
  if (!def) throw new Error(`قاعدة البيانات المحلية: جدول غير معروف «${name}»`);
  return def;
};

export const hasTable = (name: string): boolean => TABLE_MAP.has(name);

/** كل المفاتيح الأجنبية التي تشير إلى جدول معيّن (لتطبيق الحذف المتسلسل). */
export const referencingKeys = (table: string): Array<{ from: TableDef; fk: ForeignKey }> => {
  const out: Array<{ from: TableDef; fk: ForeignKey }> = [];
  for (const def of TABLES) {
    for (const fk of def.foreignKeys ?? []) {
      if (fk.table === table) out.push({ from: def, fk });
    }
  }
  return out;
};
