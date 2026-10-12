// تاريخ الحفظ ديناميكي - يمكن إضافة أي سنة
export interface HifzHistory {
  [key: string]: string; // h1441, h1442, h1443, etc.
}

export interface YearData {
  baseHifz: string;
  totalHifz: string;
  parts: string;
  annual: string;
  recitation: string;
  memorization: string;
  total: string;
  grade: string;
  prize: string;
  statusPrize: string;
  rank: string;
  teacher: string;
}

/** عمود مخصّص يضيفه المستخدم إلى سجل الطلاب (يُحفظ داخل custom_fields). */
export interface CustomColumnDef {
  id: string;
  name: string;
  type?: "text" | "number" | "date" | "phone";
}

export interface Student {
  id: number;
  name: string;
  teacher: string;
  gender?: string; // الجنس: ذكر أو أنثى
  hijri_join_date?: string; // تاريخ هجري الالتحاق
  initial_hifz?: string; // مقدار الحفظ قبل الالتحاق
  first_competition_year?: string; // عام أول مسابقة
  status?: string; // الحالة: يتيم، معوق، مسكين، طبيعي، أو حالة مخصصة
  school_grade?: string; // الصف الدراسي وقت الالتحاق
  guardian_phone?: string; // رقم ولي الأمر
  student_phone?: string; // رقم الطالب/ة
  custom_fields?: Record<string, string>; // بيانات الأعمدة المخصصة
  notes?: string;
  hifzHistory?: HifzHistory;
  yearData?: YearData;
  // ===== السجل الشامل (كل الأعوام) =====
  registered_years?: string[]; // الأعوام المسجل بها الطالب/ة
  latest_total_hifz?: string; // آخر حفظ تراكمي من آخر عام مسجل
}

export const START_YEAR = 1441;
export const END_YEAR = 1450;

/**
 * مفتاح العام قد يكون رقماً عادياً ("1447") أو برفقة مسابقة عشر ذي الحجة ("1447D").
 * هذه الدوال تنسّقه للعرض.
 */
export const formatYearKey = (key: string): string =>
  key.endsWith("D") ? `${key.slice(0, -1)}هـ · عشر ذي الحجة` : `${key}هـ`;

// نسخة مختصرة للأشرطة الصغيرة داخل الجداول
export const formatYearKeyShort = (key: string): string =>
  key.endsWith("D") ? `${key.slice(0, -1)} ذ.ح` : key;

// أشهر المتابعة الشهرية: من محرم إلى رمضان (موسم المسابقة الرمضانية)
export const TRACKING_MONTHS: { value: number; label: string }[] = [
  { value: 1, label: "محرم" },
  { value: 2, label: "صفر" },
  { value: 3, label: "ربيع الأول" },
  { value: 4, label: "ربيع الآخر" },
  { value: 5, label: "جمادى الأولى" },
  { value: 6, label: "جمادى الآخرة" },
  { value: 7, label: "رجب" },
  { value: 8, label: "شعبان" },
  { value: 9, label: "رمضان" },
  { value: 10, label: "شوال" },
  { value: 11, label: "ذو القعدة" },
  { value: 12, label: "ذو الحجة" },
];

/** خيارات الجنس المعتمدة في السجل. */
export const GENDER_OPTIONS = ["ذكر", "أنثى"];

/** حالات الطالب/ة الافتراضية (تُستعمل في القائمة المنسدلة وفي التصفية). */
export const DEFAULT_STATUSES = [
  "طبيعي",
  "يتيم",
  "يتيمة",
  "معوق",
  "معوقة",
  "فقير",
  "مسكين",
  "ذوي احتياجات خاصة",
  "وافد",
  "أخرى",
];

export interface QuranPoint {
  surah: number | null;
  ayah: number | null;
}

export interface MonthlyRecord {
  // قسم الحفظ الجديد
  memoFrom: QuranPoint;
  memoTo: QuranPoint;
  memoHifzScore: string; // تسميع الحفظ الجديد، من 25
  memoRecitationScore: string; // تلاوة الحفظ الجديد، من 15
  // قسم المراجعة
  reviewFrom: QuranPoint;
  reviewTo: QuranPoint;
  reviewHifzScore: string; // تسميع المراجعة، من 25
  reviewRecitationScore: string; // تلاوة المراجعة، من 15
  // المواظبة والسلوك (كما كانت)
  attendanceScore: string; // من 10
  behaviorScore: string; // من 10
}
