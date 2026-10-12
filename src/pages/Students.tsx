import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@/lib/router-compat";
import {
  GraduationCap,
  Search as SearchIcon,
  Plus,
  Pencil,
  Trash2,
  Save,
  Trophy,
  Sparkles,
  Home as HomeIcon,
  Globe2,
  Award,
  ScrollText,
  MoreVertical,
  User,
  FileText,
  AlertTriangle,
  Download,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Printer,
  Users,
  BookOpenCheck,
  Phone,
  RotateCcw,
} from "lucide-react";
import logo from "@/assets/logo.png";
import {
  START_YEAR,
  END_YEAR,
  GENDER_OPTIONS,
  DEFAULT_STATUSES,
  type CustomColumnDef,
  type Student,
} from "@/types/student";
import {
  loadAllStudentsAllYears,
  loadTeachers,
  getActiveYear,
  saveStudent,
  deleteStudent,
  deleteStudents,
  deleteDuplicateStudents,
  deleteYearData,
  deleteAllData,
  registerStudentInYear,
  loadCustomColumns,
  loadStudentStatuses,
  type StudentAllYears,
  type StudentProfileValues,
} from "@/utils/storage";
import { setPendingStudentLink } from "@/utils/studentLink";
import {
  getDuplicateNameCounts,
  getDuplicateCountFor,
  getExtraDuplicateRecordsCount,
  normalizeStudentName,
} from "@/utils/studentNames";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ALL_GRADES_VALUE,
  DEFAULT_SCHOOL_GRADES,
  buildSchoolGradeOptions,
  matchesSchoolGrade,
} from "@/utils/schoolGrades";
import { loadXLSX, saveWorkbook } from "@/utils/excel";

const NONE_VALUE = "__none__";

/** كل حقول ملف الطالب/ة التفصيلية بصيغة نصية (مناسبة لنماذج الإدخال). */
type ProfileForm = {
  name: string;
  teacher: string;
  gender: string;
  hijri_join_date: string;
  initial_hifz: string;
  first_competition_year: string;
  status: string;
  school_grade: string;
  guardian_phone: string;
  student_phone: string;
  notes: string;
  custom_fields: Record<string, string>;
};

const emptyForm = (): ProfileForm => ({
  name: "",
  teacher: "",
  gender: "",
  hijri_join_date: "",
  initial_hifz: "",
  first_competition_year: "",
  status: "طبيعي",
  school_grade: "",
  guardian_phone: "",
  student_phone: "",
  notes: "",
  custom_fields: {},
});

const formFromStudent = (s: Student): ProfileForm => ({
  name: s.name || "",
  teacher: s.teacher || "",
  gender: s.gender || "",
  hijri_join_date: s.hijri_join_date || "",
  initial_hifz: s.initial_hifz || "",
  first_competition_year: s.first_competition_year || "",
  status: s.status || "طبيعي",
  school_grade: s.school_grade || "",
  guardian_phone: s.guardian_phone || "",
  student_phone: s.student_phone || "",
  notes: s.notes || "",
  custom_fields: { ...(s.custom_fields || {}) },
});

/** يحوّل النموذج إلى القيم التي تفهمها دالة saveStudent. */
const formToProfile = (form: ProfileForm): StudentProfileValues => ({
  gender: form.gender.trim(),
  hijri_join_date: form.hijri_join_date.trim(),
  initial_hifz: form.initial_hifz.trim(),
  first_competition_year: form.first_competition_year.trim(),
  status: form.status.trim() || "طبيعي",
  school_grade: form.school_grade.trim(),
  guardian_phone: form.guardian_phone.trim(),
  student_phone: form.student_phone.trim(),
  notes: form.notes.trim(),
  custom_fields: form.custom_fields,
});

const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

type StudentSortField =
  | "name"
  | "gender"
  | "school_grade"
  | "teacher"
  | "status"
  | "hijri_join_date"
  | "years"
  | "parts"
  | "total"
  | "grade";
type SortDir = "asc" | "desc" | null;

const GRADE_BADGE_STYLES: Record<string, string> = {
  ممتاز: "border-emerald-300 bg-emerald-500/15 text-emerald-800 font-bold",
  "جيد جداً": "border-teal-300 bg-teal-500/15 text-teal-800 font-bold",
  جيد: "border-sky-300 bg-sky-500/15 text-sky-800 font-semibold",
  مقبول: "border-amber-300 bg-amber-500/15 text-amber-800 font-semibold",
  ضعيف: "border-rose-300 bg-rose-500/15 text-rose-800 font-semibold",
};

const STATUS_BADGE_STYLES: Record<string, string> = {
  يتيم: "border-amber-300 bg-amber-500/15 text-amber-800 font-bold",
  يتيمة: "border-amber-300 bg-amber-500/15 text-amber-800 font-bold",
  معوق: "border-purple-300 bg-purple-500/15 text-purple-800 font-bold",
  معوقة: "border-purple-300 bg-purple-500/15 text-purple-800 font-bold",
  فقير: "border-sky-300 bg-sky-500/15 text-sky-800 font-semibold",
  مسكين: "border-teal-300 bg-teal-500/15 text-teal-800 font-semibold",
  "ذوي احتياجات خاصة": "border-indigo-300 bg-indigo-500/15 text-indigo-800 font-semibold",
};

const Students = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { viewAs } = useAuth();
  // أثناء الاطلاع على بيانات مستخدم آخر: القراءة فقط.
  const readOnly = !!viewAs;

  const [students, setStudents] = useState<StudentAllYears[]>([]);
  const [teacherNames, setTeacherNames] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>(DEFAULT_STATUSES);
  const [customColumns, setCustomColumns] = useState<CustomColumnDef[]>([]);
  const [query, setQuery] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState(ALL_GRADES_VALUE);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm());
  const [registerYear, setRegisterYear] = useState("");
  const [dedupDialogOpen, setDedupDialogOpen] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [deleteYearDialogOpen, setDeleteYearDialogOpen] = useState(false);
  const [yearToDelete, setYearToDelete] = useState("");
  const [deleteOrphanStudents, setDeleteOrphanStudents] = useState(false);
  const [deletingYear, setDeletingYear] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [sortField, setSortField] = useState<StudentSortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set());
  const [deleteSelectedDialogOpen, setDeleteSelectedDialogOpen] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, registered, loadedStatuses, loadedColumns] = await Promise.all([
      loadAllStudentsAllYears(),
      loadTeachers(await getActiveYear()),
      loadStudentStatuses().catch(() => DEFAULT_STATUSES),
      loadCustomColumns().catch(() => [] as CustomColumnDef[]),
    ]);
    setStudents(list);
    setStatuses(loadedStatuses);
    setCustomColumns(loadedColumns);
    const set = new Set<string>(registered.map((r) => r.name));
    list.forEach((s) => {
      const t = (s.teacher || "").trim();
      if (t) set.add(t);
    });
    setTeacherNames(Array.from(set).sort((a, b) => a.localeCompare(b, "ar")));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void (async () => {
      const y = await getActiveYear();
      setRegisterYear(y);
      setYearToDelete(y);
    })();
  }, [load]);

  /** عدد مرات تكرار كل اسم (بعد التطبيع العربي) — لكشف الإدخال المزدوج. */
  const duplicateCounts = useMemo(() => getDuplicateNameCounts(students), [students]);
  const duplicatesTotal = useMemo(
    () => Array.from(duplicateCounts.values()).reduce((sum, n) => sum + n, 0),
    [duplicateCounts],
  );
  const extraDuplicatesCount = useMemo(() => getExtraDuplicateRecordsCount(students), [students]);

  /** خيارات السنوات الدراسية مبنية من البيانات الفعلية + القائمة المعتمدة. */
  const gradeOptions = useMemo(
    () => buildSchoolGradeOptions(students, [gradeFilter]),
    [students, gradeFilter],
  );

  const filtered = useMemo(() => {
    const q = query.trim().replace(/\s+/g, " ");
    const base = students
      .filter((s) => (teacherFilter === "all" ? true : (s.teacher || "").trim() === teacherFilter))
      .filter((s) => (genderFilter === "all" ? true : (s.gender || "") === genderFilter))
      .filter((s) => (statusFilter === "all" ? true : (s.status || "طبيعي") === statusFilter))
      .filter((s) => matchesSchoolGrade(s.school_grade, gradeFilter))
      .filter((s) =>
        q
          ? (s.name || "").includes(q) ||
            (s.teacher || "").includes(q) ||
            (s.guardian_phone || "").includes(q) ||
            (s.student_phone || "").includes(q)
          : true,
      );

    if (!sortField || !sortDir) {
      return base.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
    }

    const gradeRank: Record<string, number> = {
      ممتاز: 5,
      "جيد جداً": 4,
      جيد: 3,
      مقبول: 2,
      ضعيف: 1,
    };

    return [...base].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = (a.name || "").localeCompare(b.name || "", "ar");
          break;
        case "gender":
          cmp = (a.gender || "").localeCompare(b.gender || "", "ar");
          break;
        case "school_grade":
          cmp = (a.school_grade || "").localeCompare(b.school_grade || "", "ar");
          break;
        case "teacher":
          cmp = (a.teacher || "").localeCompare(b.teacher || "", "ar");
          break;
        case "status":
          cmp = (a.status || "طبيعي").localeCompare(b.status || "طبيعي", "ar");
          break;
        case "hijri_join_date":
          cmp = (a.hijri_join_date || "").localeCompare(b.hijri_join_date || "", "ar");
          break;
        case "years":
          cmp = (a.years?.length || 0) - (b.years?.length || 0);
          break;
        case "parts":
          cmp =
            (parseFloat(a.yearData?.parts || "0") || 0) -
            (parseFloat(b.yearData?.parts || "0") || 0);
          break;
        case "total":
          cmp =
            (parseFloat(a.yearData?.total || "0") || 0) -
            (parseFloat(b.yearData?.total || "0") || 0);
          break;
        case "grade":
          cmp =
            (gradeRank[a.yearData?.grade || ""] || 0) - (gradeRank[b.yearData?.grade || ""] || 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [students, query, teacherFilter, genderFilter, statusFilter, gradeFilter, sortField, sortDir]);

  const handleSort = (field: StudentSortField) => {
    if (sortField !== field) {
      setSortField(field);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortField(null);
      setSortDir(null);
    }
  };

  const renderSortIcon = (field: StudentSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 opacity-45 shrink-0" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-amber-300 shrink-0" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-amber-300 shrink-0" />
    );
  };

  const summaryStats = useMemo(() => {
    let maleCount = 0;
    let femaleCount = 0;
    let totalParts = 0;
    let totalScores = 0;
    let scoredCount = 0;
    let khatimCount = 0;

    for (const s of filtered) {
      if (s.gender === "ذكر") maleCount++;
      else if (s.gender === "أنثى") femaleCount++;
      const p = parseFloat(s.yearData?.parts || "0") || 0;
      const th = parseFloat(s.yearData?.totalHifz || "0") || 0;
      const tot = parseFloat(s.yearData?.total || "0") || 0;
      totalParts += p;
      if (tot > 0) {
        totalScores += tot;
        scoredCount++;
      }
      if (th >= 30 || p >= 30) khatimCount++;
    }

    return {
      maleCount,
      femaleCount,
      totalParts: Math.round(totalParts * 100) / 100,
      avgScore: scoredCount > 0 ? (totalScores / scoredCount).toFixed(1) : "0",
      khatimCount,
    };
  }, [filtered]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selectedStudentIds.has(s.id));

  const toggleSelectStudent = (id: number) => {
    if (readOnly) return;
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (readOnly) return;
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((s) => next.delete(s.id));
      } else {
        filtered.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };

  const handleConfirmDeleteSelected = async () => {
    if (readOnly || selectedStudentIds.size === 0) return;
    setDeletingSelected(true);
    try {
      const count = selectedStudentIds.size;
      await deleteStudents(Array.from(selectedStudentIds));
      setSelectedStudentIds(new Set());
      setDeleteSelectedDialogOpen(false);
      await load();
      toast({
        title: "تم حذف الطلاب المحددين",
        description: `تم حذف ${count} طالب/طالبة وبياناتهم نهائياً.`,
        variant: "destructive",
      });
    } catch (error) {
      console.error("Delete selected students failed:", error);
      toast({ title: "تعذّر حذف الطلاب المحددين", variant: "destructive" });
    } finally {
      setDeletingSelected(false);
    }
  };

  const hasActiveFilters =
    teacherFilter !== "all" ||
    genderFilter !== "all" ||
    statusFilter !== "all" ||
    gradeFilter !== ALL_GRADES_VALUE ||
    query.trim() !== "";

  const resetFilters = () => {
    setTeacherFilter("all");
    setGenderFilter("all");
    setStatusFilter("all");
    setGradeFilter(ALL_GRADES_VALUE);
    setQuery("");
  };

  const handlePrintTable = async () => {
    const { printHtmlDocument } = await import("@/utils/nativePrint");
    const rowsHtml = filtered
      .map(
        (s, i) => `
        <tr>
          <td>${i + 1}</td>
          <td style="text-align:right;font-weight:bold;">${s.name || "—"}</td>
          <td>${s.gender || "—"}</td>
          <td>${s.school_grade || "—"}</td>
          <td>${s.teacher || "—"}</td>
          <td>${s.status || "طبيعي"}</td>
          <td>${s.hijri_join_date || "—"}</td>
          <td>${(s.years || []).map((y) => `${y}هـ`).join("، ") || "—"}</td>
          <td>${s.yearData?.parts || "0"}</td>
          <td>${s.yearData?.total || "0"}</td>
          <td>${s.yearData?.grade || "—"}</td>
          <td dir="ltr">${s.guardian_phone || s.student_phone || "—"}</td>
        </tr>`,
      )
      .join("");

    const html = `
      <html dir="rtl">
        <head>
          <title>كشف السجل الرسمي للطلاب والطالبات</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 18px; color: #133829; }
            .header { text-align: center; margin-bottom: 16px; border-bottom: 3px solid #1b6b50; padding-bottom: 12px; }
            .header img { height: 72px; margin-bottom: 6px; }
            .header h1 { font-size: 20px; color: #1b6b50; }
            .header p { font-size: 13px; color: #555; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #1b6b50; color: #fff; padding: 8px 6px; border: 1px solid #14523d; }
            td { padding: 6px; border: 1px solid #cbd5e1; text-align: center; }
            tr:nth-child(even) { background: #f3faf7; }
            tfoot td { background: #e6f4ee; font-weight: bold; border-top: 2px solid #1b6b50; }
            @media print { @page { size: landscape; margin: 10mm; } }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="${logo}" alt="الشعار" />
            <h1>مركز إنماء الأهلي الخيري — السجل الرسمي للطلاب والطالبات</h1>
            <p>إجمالي السجلات: ${filtered.length} | مجموع الأجزاء: ${summaryStats.totalParts} | متوسط الدرجات: ${summaryStats.avgScore}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>م</th>
                <th>الاسم</th>
                <th>الجنس</th>
                <th>السنة الدراسية</th>
                <th>المعلم/المعلمة</th>
                <th>الحالة</th>
                <th>تاريخ الالتحاق</th>
                <th>سنوات التسجيل</th>
                <th>الأجزاء</th>
                <th>المجموع</th>
                <th>التقدير</th>
                <th>الهاتف</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              <tr>
                <td colspan="8">الإجمالي (${filtered.length} طالب/طالبة)</td>
                <td>${summaryStats.totalParts}</td>
                <td>متوسط: ${summaryStats.avgScore}</td>
                <td colspan="2">خاتمون: ${summaryStats.khatimCount}</td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `;
    await printHtmlDocument(html, "السجل_الرسمي_للطلاب_والطالبات");
  };

  const goTo = (path: string, studentName: string) => {
    setPendingStudentLink(studentName);
    navigate(path);
  };

  const openAdd = () => {
    if (readOnly) return;
    setEditingId(null);
    setForm(emptyForm());
    void (async () => setRegisterYear(await getActiveYear()))();
    setDialogOpen(true);
  };

  const openEdit = (s: StudentAllYears) => {
    if (readOnly) return;
    setEditingId(s.id);
    setForm(formFromStudent(s));
    setDialogOpen(true);
  };

  const save = async () => {
    if (readOnly) return;
    const name = form.name.trim();
    if (!name) {
      toast({ title: "اسم الطالب/الطالبة مطلوب", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const teacher = form.teacher.trim();
      const profile = formToProfile(form);
      if (editingId) {
        await saveStudent({ id: editingId, name, teacher, ...profile });
        toast({ title: "تم تعديل بيانات الطالب/الطالبة" });
      } else {
        const newId = await saveStudent({ name, teacher, ...profile });
        if (newId) {
          await registerStudentInYear(registerYear, newId, teacher);
        }
        toast({
          title: "تمت الإضافة",
          description: `تم تسجيل ${name} في سجل عام ${registerYear}هـ`,
        });
      }
      setDialogOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: StudentAllYears) => {
    if (readOnly) return;
    if (
      !confirm(
        `هل أنت متأكد من حذف "${s.name}"؟ سيتم حذف كل بياناته/بياناتها (الحفظ، الدرجات) من كل الأعوام نهائيًا.`,
      )
    )
      return;
    await deleteStudent(s.id);
    toast({ title: "تم الحذف", variant: "destructive" });
    await load();
  };

  const handleDeleteDuplicates = async () => {
    if (readOnly) return;
    setDeduping(true);
    try {
      const removed = await deleteDuplicateStudents();
      setDedupDialogOpen(false);
      await load();
      toast({
        title: removed > 0 ? "تم حذف الأسماء المكررة" : "لا توجد أسماء مكررة",
        description:
          removed > 0
            ? `تم دمج وحذف ${removed} سجل مكرر مع الاحتفاظ ببيانات ودرجات الطالب/ة.`
            : "جميع أسماء الطلاب والطالبات في السجل غير مكررة.",
      });
    } catch (error) {
      console.error("Deduplicate failed:", error);
      toast({ title: "تعذّر حذف الأسماء المكررة", variant: "destructive" });
    } finally {
      setDeduping(false);
    }
  };

  const handleConfirmDeleteYear = async () => {
    if (readOnly || !yearToDelete) return;
    setDeletingYear(true);
    try {
      await deleteYearData(yearToDelete, {
        includeAllYearTables: true,
        deleteOrphanStudents,
      });
      setDeleteYearDialogOpen(false);
      await load();
      toast({
        title: `تم حذف بيانات عام ${yearToDelete}هـ`,
        description: deleteOrphanStudents
          ? `تم حذف جميع بيانات عام ${yearToDelete}هـ مع الطلاب المسجلين في هذا العام فقط.`
          : `تم حذف بيانات عام ${yearToDelete}هـ مع بقاء أسماء الطلاب في السجل العام.`,
        variant: "destructive",
      });
    } catch (error) {
      console.error("Delete year failed:", error);
      toast({ title: "تعذّر حذف بيانات العام", variant: "destructive" });
    } finally {
      setDeletingYear(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    if (readOnly) return;
    setDeletingAll(true);
    try {
      await deleteAllData();
      setDeleteAllDialogOpen(false);
      await load();
      toast({
        title: "تم حذف كل البيانات",
        description: "تم مسح جميع الطلاب والطالبات وبيانات كافة الأعوام نهائياً.",
        variant: "destructive",
      });
    } catch (error) {
      console.error("Delete all failed:", error);
      toast({ title: "تعذّر حذف كل البيانات", variant: "destructive" });
    } finally {
      setDeletingAll(false);
    }
  };

  /** تصدير السجل المعروض حالياً إلى Excel (مع كل حقول الملف التفصيلية). */
  const exportExcel = async () => {
    if (filtered.length === 0) {
      toast({ title: "لا توجد بيانات", description: "لا يوجد ما يُصدَّر", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const XLSX = await loadXLSX();
      const rows = filtered.map((s) => {
        const row: Record<string, string> = {
          الاسم: s.name || "",
          "المعلم/المعلمة": s.teacher || "",
          الجنس: s.gender || "",
          "السنة الدراسية": s.school_grade || "",
          الحالة: s.status || "",
          "تاريخ الالتحاق": s.hijri_join_date || "",
          "الحفظ قبل الالتحاق": s.initial_hifz || "",
          "عام أول مسابقة": s.first_competition_year || "",
          "هاتف ولي الأمر": s.guardian_phone || "",
          "هاتف الطالب/ة": s.student_phone || "",
          "سنوات التسجيل": (s.years || []).join("، "),
          "الأجزاء (آخر سنة)": s.yearData?.parts || "",
          "المجموع (آخر سنة)": s.yearData?.total || "",
          التقدير: s.yearData?.grade || "",
          ملاحظات: s.notes || "",
        };
        for (const col of customColumns) {
          row[col.name] = s.custom_fields?.[col.id] || "";
        }
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "سجل الطلاب والطالبات");
      await saveWorkbook(wb, "سجل_الطلاب_و الطالبات.xlsx");
      toast({ title: "تم التصدير", description: `تم تصدير ${rows.length} سجل` });
    } catch (error) {
      console.error("Export failed:", error);
      toast({ title: "تعذّر التصدير", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.45))]"
      dir="rtl"
    >
      <header className="mx-3 mt-3 rounded-[2rem] bg-gradient-to-br from-primary via-emerald-700 to-teal-950 px-4 py-5 text-primary-foreground shadow-2xl shadow-primary/20">
        <div className="container mx-auto max-w-7xl">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img src={logo} alt="الشعار" className="h-16 w-auto" />
          </div>
          <div className="text-center">
            <p className="text-xs opacity-80">مركز إنماء الأهلي الخيري</p>
            <h1 className="text-2xl font-bold flex items-center justify-center gap-2 mt-1">
              <GraduationCap className="h-6 w-6" /> السجل الرسمي للطلاب والطالبات
            </h1>
            <p className="text-sm opacity-90 mt-1">جميع الأعوام — {filtered.length} مسجّل</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-7 space-y-4">
        {/* بطاقات إحصائية سريعة */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/70 bg-card/90 p-3.5 shadow-lg shadow-primary/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                إجمالي السجل المعروض
              </span>
              <GraduationCap className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-primary">{filtered.length}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              من أصل {students.length} مسجل في النظام
            </div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-card/90 p-3.5 shadow-lg shadow-primary/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">توزيع الجنس</span>
              <Users className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-3">
              <span className="text-lg font-black text-sky-700">{summaryStats.maleCount} ذكر</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-lg font-black text-rose-700">
                {summaryStats.femaleCount} أنثى
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {teacherNames.length} معلم/معلمة في السجل
            </div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-card/90 p-3.5 shadow-lg shadow-primary/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                إجمالي الأجزاء (آخر عام)
              </span>
              <BookOpenCheck className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-amber-600">
              {summaryStats.totalParts.toLocaleString("ar-EG")}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {summaryStats.khatimCount} خاتم/خاتمة للقرآن الكريم
            </div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-card/90 p-3.5 shadow-lg shadow-primary/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">متوسط الدرجات</span>
              <Trophy className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-emerald-700">
              {summaryStats.avgScore}
              <span className="mr-1 text-xs font-normal text-muted-foreground">/ 100</span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {extraDuplicatesCount > 0
                ? `${extraDuplicatesCount} سجل مكرر يحتاج مراجعة`
                : "السجل خالٍ من الأسماء المكررة"}
            </div>
          </div>
        </div>

        {readOnly && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <Eye className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              تطالع سجل <strong>{viewAs?.name}</strong> — القراءة فقط، والإضافة والتعديل والحذف
              معطّلة حتى تعود إلى بياناتك.
            </p>
          </div>
        )}

        {duplicatesTotal > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300/70 bg-amber-50/70 p-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                يوجد <strong>{duplicatesTotal}</strong> سجل بأسماء مكررة ({extraDuplicatesCount} سجل
                زائد بعد تجاهل التشكيل واختلاف الألف والياء والتاء المربوطة). راجعها من شارة «مكرر»
                بجانب الاسم — قد تكون إدخالاً مزدوجاً للطالب/ة نفسه.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={readOnly || deduping}
              onClick={() => setDedupDialogOpen(true)}
              className="gap-1 border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
            >
              <Trash2 className="h-3.5 w-3.5" /> حذف مكرر أسماء الطلاب ({extraDuplicatesCount})
            </Button>
          </div>
        )}

        {/* أدوات البحث والتصفية والإضافة */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={teacherFilter} onValueChange={setTeacherFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="كل المعلمين والمعلمات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المعلمين والمعلمات</SelectItem>
              {teacherNames.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="كل السنوات الدراسية" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GRADES_VALUE}>كل السنوات الدراسية</SelectItem>
              {gradeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  {option.count > 0 ? ` (${option.count})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={genderFilter} onValueChange={setGenderFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="الجنس" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {GENDER_OPTIONS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {statuses.map((st) => (
                <SelectItem key={st} value={st}>
                  {st}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[180px]">
            <SearchIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو المعلم أو رقم الهاتف..."
              className="pr-9"
            />
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="gap-1 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" /> مسح التصفية
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-1"
            onClick={() => void handlePrintTable()}
            disabled={filtered.length === 0}
          >
            <Printer className="h-4 w-4" /> طباعة الجدول
          </Button>
          <Button
            variant="outline"
            className="gap-1"
            onClick={() => void exportExcel()}
            disabled={exporting}
          >
            <Download className="h-4 w-4" /> {exporting ? "جارٍ التصدير..." : "تصدير Excel"}
          </Button>
          <Button
            variant="outline"
            className="gap-1"
            onClick={() => setDedupDialogOpen(true)}
            disabled={readOnly || deduping}
          >
            <Trash2 className="h-4 w-4 text-amber-600" />
            حذف مكرر أسماء الطلاب
            {extraDuplicatesCount > 0 && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">
                {extraDuplicatesCount}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteYearDialogOpen(true)}
            disabled={readOnly}
          >
            <Trash2 className="h-4 w-4" /> حذف بيانات عام
          </Button>
          <Button
            variant="destructive"
            className="gap-1"
            onClick={() => setDeleteAllDialogOpen(true)}
            disabled={readOnly}
          >
            <Trash2 className="h-4 w-4" /> حذف كل البيانات
          </Button>
          <Button className="gap-1" onClick={openAdd} disabled={readOnly}>
            <Plus className="h-4 w-4" /> إضافة طالب/طالبة
          </Button>
        </div>

        {/* الجدول الرسمي المتميز — كل الأعوام */}
        {loading ? (
          <div className="rounded-[1.75rem] border border-white/70 bg-card/85 py-16 text-center text-muted-foreground shadow-xl shadow-primary/5">
            جارٍ تحميل بيانات الطلاب والطالبات...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-primary/25 bg-card/80 py-14 text-center text-muted-foreground shadow-lg shadow-primary/5">
            لا يوجد طلاب وطالبات مطابقون لمعايير البحث الحالية
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-card/95 shadow-2xl shadow-primary/10 backdrop-blur">
            {/* شريط عنوان الجدول وأدوات التحديد */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-gradient-to-l from-primary/[0.08] via-emerald-500/[0.04] to-transparent px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-foreground sm:text-base">
                    جدول السجل الشامل للطلاب والطالبات
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    انقر على رأس أي عمود للفرز التصاعدي أو التنازلي · اسحب أفقياً لرؤية جميع الأعمدة
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedStudentIds.size > 0 && !readOnly && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedStudentIds(new Set())}
                      className="h-8 text-xs"
                    >
                      إلغاء التحديد ({selectedStudentIds.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteSelectedDialogOpen(true)}
                      className="h-8 gap-1 rounded-xl text-xs shadow-sm"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف الطلاب المحددين ({selectedStudentIds.size})
                    </Button>
                  </>
                )}
                <span className="rounded-full bg-primary/12 px-3 py-1 text-xs font-extrabold text-primary ring-1 ring-primary/20">
                  {filtered.length} طالب/طالبة
                </span>
              </div>
            </div>

            <div className="max-h-[72vh] overflow-auto">
              <table className="w-full min-w-[1220px] border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20 bg-gradient-to-l from-primary via-emerald-700 to-teal-800 text-primary-foreground shadow-md">
                  <tr>
                    <th className="sticky right-0 z-30 w-11 border-b border-l border-white/15 bg-primary px-2 py-3 text-center">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={toggleSelectAllFiltered}
                        disabled={readOnly || filtered.length === 0}
                        aria-label="تحديد الكل"
                        className="border-white/70 data-[state=checked]:bg-white data-[state=checked]:text-primary"
                      />
                    </th>
                    <th className="sticky right-11 z-30 w-12 border-b border-l border-white/15 bg-primary px-2 py-3 text-center font-black">
                      م
                    </th>
                    <th
                      onClick={() => handleSort("name")}
                      className="sticky right-[92px] z-30 min-w-[230px] cursor-pointer select-none border-b border-l border-white/15 bg-primary px-3 py-3 text-right font-bold transition-colors hover:bg-emerald-800"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>اسم الطالب / الطالبة</span>
                        {renderSortIcon("name")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("gender")}
                      className="w-24 cursor-pointer select-none border-b border-l border-white/15 px-2.5 py-3 text-center font-bold transition-colors hover:bg-white/10"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>الجنس</span>
                        {renderSortIcon("gender")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("school_grade")}
                      className="min-w-[135px] cursor-pointer select-none border-b border-l border-white/15 px-3 py-3 text-right font-bold transition-colors hover:bg-white/10"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>السنة الدراسية</span>
                        {renderSortIcon("school_grade")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("teacher")}
                      className="min-w-[155px] cursor-pointer select-none border-b border-l border-white/15 px-3 py-3 text-right font-bold transition-colors hover:bg-white/10"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>المعلم / المعلمة</span>
                        {renderSortIcon("teacher")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("status")}
                      className="min-w-[110px] cursor-pointer select-none border-b border-l border-white/15 px-2.5 py-3 text-center font-bold transition-colors hover:bg-white/10"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>الحالة</span>
                        {renderSortIcon("status")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("hijri_join_date")}
                      className="min-w-[120px] cursor-pointer select-none border-b border-l border-white/15 px-2.5 py-3 text-center font-bold transition-colors hover:bg-white/10"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>تاريخ الالتحاق</span>
                        {renderSortIcon("hijri_join_date")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("years")}
                      className="min-w-[140px] cursor-pointer select-none border-b border-l border-white/15 px-2.5 py-3 text-center font-bold transition-colors hover:bg-white/10"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>سنوات التسجيل</span>
                        {renderSortIcon("years")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("parts")}
                      className="min-w-[110px] cursor-pointer select-none border-b border-l border-white/15 px-2.5 py-3 text-center font-bold transition-colors hover:bg-white/10"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>الأجزاء (آخر عام)</span>
                        {renderSortIcon("parts")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("total")}
                      className="min-w-[110px] cursor-pointer select-none border-b border-l border-white/15 px-2.5 py-3 text-center font-bold transition-colors hover:bg-white/10"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>المجموع (100)</span>
                        {renderSortIcon("total")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("grade")}
                      className="min-w-[105px] cursor-pointer select-none border-b border-l border-white/15 px-2.5 py-3 text-center font-bold transition-colors hover:bg-white/10"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>التقدير</span>
                        {renderSortIcon("grade")}
                      </div>
                    </th>
                    <th className="min-w-[125px] border-b border-l border-white/15 px-2.5 py-3 text-center font-bold">
                      التواصل
                    </th>
                    {customColumns.map((col) => (
                      <th
                        key={col.id}
                        className="min-w-[120px] border-b border-l border-white/15 px-2.5 py-3 text-center font-bold"
                      >
                        {col.name}
                      </th>
                    ))}
                    <th className="min-w-[130px] border-b border-white/15 px-3 py-3 text-center font-bold">
                      إجراءات
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => {
                    const dupCount = getDuplicateCountFor(s.name, duplicateCounts);
                    const isSelected = selectedStudentIds.has(s.id);
                    const partsNum = parseFloat(s.yearData?.parts || "0") || 0;
                    const totalHifzNum = parseFloat(s.yearData?.totalHifz || "0") || 0;
                    const totalScoreNum = parseFloat(s.yearData?.total || "0") || 0;
                    const isKhatim = totalHifzNum >= 30 || partsNum >= 30;
                    const gradeText = s.yearData?.grade || "";
                    const statusText = s.status || "طبيعي";
                    const phoneDisplay = s.guardian_phone || s.student_phone || "";

                    return (
                      <tr
                        key={s.id}
                        className={`group transition-colors ${
                          isSelected
                            ? "bg-primary/12 hover:bg-primary/16"
                            : dupCount > 1
                              ? "bg-amber-50/60 hover:bg-amber-100/60"
                              : "odd:bg-card even:bg-secondary/25 hover:bg-primary/[0.06]"
                        }`}
                      >
                        <td className="sticky right-0 z-10 border-b border-l border-border/60 bg-inherit px-2 py-2.5 text-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectStudent(s.id)}
                            disabled={readOnly}
                            aria-label={`تحديد ${s.name}`}
                          />
                        </td>
                        <td className="sticky right-11 z-10 border-b border-l border-border/60 bg-inherit px-2 py-2.5 text-center font-black text-primary">
                          {i + 1}
                        </td>
                        <td className="sticky right-[92px] z-10 border-b border-l border-border/60 bg-inherit px-3 py-2.5 font-semibold shadow-[-8px_0_14px_-12px_rgba(0,0,0,0.18)]">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold shadow-xs ${
                                s.gender === "ذكر"
                                  ? "bg-sky-500/15 text-sky-700"
                                  : s.gender === "أنثى"
                                    ? "bg-rose-500/15 text-rose-700"
                                    : "bg-primary/12 text-primary"
                              }`}
                            >
                              <User className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-foreground">{s.name || "—"}</span>
                                {isKhatim && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-300 bg-amber-400/20 px-2 py-0.5 text-[10px] font-black text-amber-800">
                                    خاتم ✨
                                  </span>
                                )}
                                {dupCount > 1 && (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-400 bg-amber-100 text-[10px] font-bold text-amber-800"
                                    title={`يوجد ${dupCount} سجلات بالاسم نفسه (بعد التطبيع)`}
                                  >
                                    مكرر ×{dupCount}
                                  </Badge>
                                )}
                              </div>
                              {s.notes && (
                                <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
                                  {s.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-l border-border/60 px-2.5 py-2.5 text-center">
                          {s.gender === "ذكر" ? (
                            <span className="inline-flex rounded-full border border-sky-200 bg-sky-500/12 px-2.5 py-0.5 text-xs font-bold text-sky-800">
                              ذكر
                            </span>
                          ) : s.gender === "أنثى" ? (
                            <span className="inline-flex rounded-full border border-rose-200 bg-rose-500/12 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                              أنثى
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="border-b border-l border-border/60 px-3 py-2.5">
                          {s.school_grade ? (
                            <span className="inline-flex rounded-lg bg-secondary/70 px-2 py-0.5 text-xs font-semibold text-foreground">
                              {s.school_grade}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="border-b border-l border-border/60 px-3 py-2.5">
                          {s.teacher ? (
                            <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                              {s.teacher}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="border-b border-l border-border/60 px-2.5 py-2.5 text-center">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${
                              STATUS_BADGE_STYLES[statusText] ||
                              (statusText !== "طبيعي"
                                ? "border-primary/30 bg-primary/10 font-semibold text-primary"
                                : "border-border bg-muted/50 text-muted-foreground")
                            }`}
                          >
                            {statusText}
                          </span>
                        </td>
                        <td className="border-b border-l border-border/60 px-2.5 py-2.5 text-center text-xs">
                          {s.hijri_join_date ? (
                            <div className="font-medium">
                              <div>{s.hijri_join_date}</div>
                              {s.initial_hifz && (
                                <div className="text-[10px] text-muted-foreground">
                                  سابق: {s.initial_hifz}
                                </div>
                              )}
                            </div>
                          ) : s.initial_hifz ? (
                            <span className="text-[11px] text-muted-foreground">
                              سابق: {s.initial_hifz}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="border-b border-l border-border/60 px-2.5 py-2.5 text-center">
                          {s.years.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-1">
                              {s.years.map((y) => (
                                <span
                                  key={y}
                                  className="inline-flex items-center rounded-md border border-primary/25 bg-primary/8 px-1.5 py-0.5 text-[11px] font-bold text-primary"
                                >
                                  {y}هـ
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="border-b border-l border-border/60 bg-amber-500/[0.04] px-2.5 py-2.5 text-center">
                          {partsNum > 0 ? (
                            <span className="inline-flex min-w-10 items-center justify-center rounded-lg bg-amber-500/15 px-2 py-0.5 font-extrabold text-amber-800">
                              {s.yearData?.parts}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="border-b border-l border-border/60 bg-emerald-500/[0.04] px-2.5 py-2.5 text-center">
                          {totalScoreNum > 0 ? (
                            <span className="inline-flex min-w-12 items-center justify-center rounded-lg bg-emerald-500/15 px-2 py-0.5 font-extrabold text-emerald-800">
                              {s.yearData?.total}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="border-b border-l border-border/60 px-2.5 py-2.5 text-center">
                          {gradeText ? (
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${
                                GRADE_BADGE_STYLES[gradeText] ||
                                "border-border bg-secondary text-foreground font-semibold"
                              }`}
                            >
                              {gradeText}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td
                          className="border-b border-l border-border/60 px-2.5 py-2.5 text-center text-xs"
                          dir="ltr"
                        >
                          {phoneDisplay ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-muted/60 px-2 py-0.5 font-medium text-foreground">
                              <Phone className="h-3 w-3 text-primary" />
                              {phoneDisplay}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        {customColumns.map((col) => (
                          <td
                            key={col.id}
                            className="border-b border-l border-border/60 px-2.5 py-2.5 text-center text-xs"
                          >
                            {s.custom_fields?.[col.id] || "—"}
                          </td>
                        ))}
                        <td className="border-b border-border/60 px-2.5 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openEdit(s)}
                              disabled={readOnly}
                              title="تعديل الملف"
                              className="h-8 w-8 rounded-xl p-0"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => void remove(s)}
                              disabled={readOnly}
                              title="حذف"
                              className="h-8 w-8 rounded-xl p-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 rounded-xl p-0"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                <DropdownMenuLabel>روابط سريعة — {s.name}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => goTo("/search", s.name)}>
                                  <Trophy className="h-4 w-4 ml-2" /> المسابقة الرمضانية (كل
                                  الأعوام)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => goTo("/monthly-search", s.name)}>
                                  <Sparkles className="h-4 w-4 ml-2" /> المتابعة الشهرية (كل
                                  الأعوام)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => goTo("/internal-competition", s.name)}
                                >
                                  <HomeIcon className="h-4 w-4 ml-2" /> إضافة نتيجة مسابقة داخلية
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => goTo("/external-competition", s.name)}
                                >
                                  <Globe2 className="h-4 w-4 ml-2" /> إضافة نتيجة مسابقة خارجية
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate("/awards")}>
                                  <Award className="h-4 w-4 ml-2" /> التكريم والجوائز
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate("/certificates")}>
                                  <ScrollText className="h-4 w-4 ml-2" /> الشهادات
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => goTo("/reports", s.name)}>
                                  <FileText className="h-4 w-4 ml-2" /> تقرير شامل + طباعة
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 z-10 bg-gradient-to-l from-secondary via-secondary/95 to-background font-bold text-foreground shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
                  <tr>
                    <td
                      colSpan={9}
                      className="border-t-2 border-l border-primary/30 px-4 py-2.5 text-right text-xs sm:text-sm"
                    >
                      خلاصة الكشف المعروض:{" "}
                      <span className="font-black text-primary">{filtered.length}</span> طالب/طالبة
                      ({summaryStats.maleCount} ذكر · {summaryStats.femaleCount} أنثى)
                    </td>
                    <td className="border-t-2 border-l border-primary/30 px-2.5 py-2.5 text-center text-xs font-black text-amber-800">
                      مجموع: {summaryStats.totalParts}
                    </td>
                    <td className="border-t-2 border-l border-primary/30 px-2.5 py-2.5 text-center text-xs font-black text-emerald-800">
                      متوسط: {summaryStats.avgScore}
                    </td>
                    <td
                      colSpan={3 + customColumns.length}
                      className="border-t-2 border-primary/30 px-3 py-2.5 text-center text-xs text-muted-foreground"
                    >
                      الخاتمون والخاتمات:{" "}
                      <strong className="text-foreground">{summaryStats.khatimCount}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "تعديل ملف الطالب/الطالبة" : "إضافة طالب/طالبة جديد"}
            </DialogTitle>
            <DialogDescription>
              الحقول اختيارية عدا الاسم — تُحفظ ضمن ملف الطالب/ة وتظهر في السجل والتقارير والتصدير.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto pl-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">الاسم *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="الاسم الكامل"
                />
                {/* تحذير فوري أثناء الكتابة: كم سجلاً آخر يحمل الاسم نفسه (بعد التطبيع)؟
                    عند التعديل لا يُحتسب سجل الطالب/ة المفتوح نفسه. */}
                {(() => {
                  const typed = normalizeStudentName(form.name);
                  if (!typed) return null;
                  const others = students.filter(
                    (s) => s.id !== editingId && normalizeStudentName(s.name) === typed,
                  ).length;
                  if (others === 0) return null;
                  return (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      يوجد {others} سجل آخر بالاسم نفسه — تأكد أنه ليس إدخالاً مزدوجاً.
                    </p>
                  );
                })()}
              </div>

              <div>
                <label className="text-sm font-medium">المعلم/المعلمة</label>
                {teacherNames.length > 0 ? (
                  <Select
                    value={form.teacher || NONE_VALUE}
                    onValueChange={(v) => setForm({ ...form, teacher: v === NONE_VALUE ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر المعلم/المعلمة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>— بدون —</SelectItem>
                      {teacherNames.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.teacher}
                    onChange={(e) => setForm({ ...form, teacher: e.target.value })}
                    placeholder="اسم المعلم/المعلمة"
                  />
                )}
              </div>

              <div>
                <label className="text-sm font-medium">الجنس</label>
                <Select
                  value={form.gender || NONE_VALUE}
                  onValueChange={(v) => setForm({ ...form, gender: v === NONE_VALUE ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— غير محدد —</SelectItem>
                    {GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">السنة الدراسية وقت الالتحاق</label>
                <Select
                  value={form.school_grade || NONE_VALUE}
                  onValueChange={(v) =>
                    setForm({ ...form, school_grade: v === NONE_VALUE ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— غير محدد —</SelectItem>
                    {(form.school_grade && !DEFAULT_SCHOOL_GRADES.includes(form.school_grade)
                      ? [form.school_grade, ...DEFAULT_SCHOOL_GRADES]
                      : DEFAULT_SCHOOL_GRADES
                    ).map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">الحالة</label>
                <Select
                  value={form.status || NONE_VALUE}
                  onValueChange={(v) => setForm({ ...form, status: v === NONE_VALUE ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent>
                    {(statuses.includes(form.status) || !form.status
                      ? statuses
                      : [form.status, ...statuses]
                    ).map((st) => (
                      <SelectItem key={st} value={st}>
                        {st}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">تاريخ الالتحاق (هجري)</label>
                <Input
                  value={form.hijri_join_date}
                  onChange={(e) => setForm({ ...form, hijri_join_date: e.target.value })}
                  placeholder="مثال: 1447/01/15"
                />
              </div>

              <div>
                <label className="text-sm font-medium">الحفظ قبل الالتحاق</label>
                <Input
                  value={form.initial_hifz}
                  onChange={(e) => setForm({ ...form, initial_hifz: e.target.value })}
                  placeholder="مثال: 3 أجزاء"
                />
              </div>

              <div>
                <label className="text-sm font-medium">عام أول مسابقة</label>
                <Select
                  value={form.first_competition_year || NONE_VALUE}
                  onValueChange={(v) =>
                    setForm({ ...form, first_competition_year: v === NONE_VALUE ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— غير محدد —</SelectItem>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}هـ
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">هاتف ولي الأمر</label>
                <Input
                  value={form.guardian_phone}
                  onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
                  placeholder="7xxxxxxxx"
                  inputMode="tel"
                  dir="ltr"
                  className="text-right"
                />
              </div>

              <div>
                <label className="text-sm font-medium">هاتف الطالب/ة</label>
                <Input
                  value={form.student_phone}
                  onChange={(e) => setForm({ ...form, student_phone: e.target.value })}
                  placeholder="7xxxxxxxx"
                  inputMode="tel"
                  dir="ltr"
                  className="text-right"
                />
              </div>

              {customColumns.length > 0 && (
                <div className="sm:col-span-2 space-y-3 rounded-xl border border-dashed p-3">
                  <p className="text-xs font-bold text-muted-foreground">الأعمدة المخصّصة</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {customColumns.map((col) => (
                      <div key={col.id}>
                        <label className="text-sm font-medium">{col.name}</label>
                        <Input
                          type={col.type === "number" ? "number" : "text"}
                          inputMode={col.type === "phone" ? "tel" : undefined}
                          dir={col.type === "phone" ? "ltr" : undefined}
                          value={form.custom_fields[col.id] || ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              custom_fields: {
                                ...form.custom_fields,
                                [col.id]: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="text-sm font-medium">ملاحظات</label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="ملاحظات عن الطالب/ة (اختياري)"
                />
              </div>

              {!editingId && (
                <div>
                  <label className="text-sm font-medium">سنة التسجيل</label>
                  <Select value={registerYear} onValueChange={setRegisterYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}هـ
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="gap-1">
              <Save className="h-4 w-4" /> {saving ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف مكرر أسماء الطلاب */}
      <Dialog open={dedupDialogOpen} onOpenChange={setDedupDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-amber-600" /> حذف مكرر أسماء الطلاب
            </DialogTitle>
            <DialogDescription>
              {extraDuplicatesCount > 0
                ? `سيتم دمج وحذف ${extraDuplicatesCount} سجل مكرر (من أصل ${duplicatesTotal} سجل متشابه بالاسم) مع الاحتفاظ بسجل أصلي واحد لكل طالب/ة ونقل أي درجات أو بيانات أعوام إليه حتى لا تضيع.`
                : "لا توجد حالياً أسماء مكررة في السجل، ولكن يمكنك تشغيل الفحص للتأكد."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDedupDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => void handleDeleteDuplicates()}
              disabled={deduping}
              className="gap-1"
            >
              <Trash2 className="h-4 w-4" />
              {deduping ? "جارٍ حذف المكرر..." : "تأكيد حذف المكرر"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف بيانات عام */}
      <Dialog open={deleteYearDialogOpen} onOpenChange={setDeleteYearDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> حذف بيانات عام
            </DialogTitle>
            <DialogDescription>
              اختر العام المراد حذف بياناته (الدرجات، الحفظ، المتابعة الشهرية، الحلقات، المعلمين،
              الجوائز، الشهادات، المصروفات، والمسابقات الخاصة بذلك العام).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">اختر العام الهجري</label>
              <Select value={yearToDelete} onValueChange={setYearToDelete}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر العام" />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}هـ
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm hover:bg-secondary/40">
              <Checkbox
                checked={deleteOrphanStudents}
                onCheckedChange={(v) => setDeleteOrphanStudents(v === true)}
                className="mt-0.5"
              />
              <div>
                <div className="font-semibold">
                  حذف الطلاب المسجلين في عام {yearToDelete}هـ فقط من السجل العام أيضاً
                </div>
                <div className="text-xs text-muted-foreground">
                  إذا لم تحدد هذا الخيار، تُحذف درجات وبيانات عام {yearToDelete}هـ فقط وتبقى أسماء
                  الطلاب في السجل العام.
                </div>
              </div>
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteYearDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDeleteYear()}
              disabled={deletingYear || !yearToDelete}
              className="gap-1"
            >
              <Trash2 className="h-4 w-4" />
              {deletingYear ? "جارٍ الحذف..." : `حذف بيانات عام ${yearToDelete}هـ`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف كل البيانات */}
      <Dialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> حذف كل البيانات نهائياً
            </DialogTitle>
            <DialogDescription>
              سيتم حذف جميع الطلاب والطالبات وبيانات كافة الأعوام والمتابعات الشهرية والمعلمين
              والحلقات والجوائز والشهادات والمصروفات نهائياً من مجلد قاعدة البيانات. هذا الإجراء لا
              يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteAllDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDeleteAll()}
              disabled={deletingAll}
              className="gap-1"
            >
              <Trash2 className="h-4 w-4" />
              {deletingAll ? "جارٍ الحذف..." : "تأكيد حذف كل البيانات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف الطلاب المحددين */}
      <Dialog open={deleteSelectedDialogOpen} onOpenChange={setDeleteSelectedDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> حذف الطلاب المحددين ({selectedStudentIds.size})
            </DialogTitle>
            <DialogDescription>
              سيتم حذف {selectedStudentIds.size} طالب/طالبة مع كافة درجاتهم وسجل حفظهم من جميع
              الأعوام نهائياً.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteSelectedDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDeleteSelected()}
              disabled={deletingSelected || selectedStudentIds.size === 0}
              className="gap-1"
            >
              <Trash2 className="h-4 w-4" />
              {deletingSelected ? "جارٍ الحذف..." : `تأكيد حذف (${selectedStudentIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Students;
