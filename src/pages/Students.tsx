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
  normalizeStudentName,
} from "@/utils/studentNames";
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
    void (async () => setRegisterYear(await getActiveYear()))();
  }, [load]);

  /** عدد مرات تكرار كل اسم (بعد التطبيع العربي) — لكشف الإدخال المزدوج. */
  const duplicateCounts = useMemo(() => getDuplicateNameCounts(students), [students]);
  const duplicatesTotal = useMemo(
    () => Array.from(duplicateCounts.values()).reduce((sum, n) => sum + n, 0),
    [duplicateCounts],
  );

  /** خيارات السنوات الدراسية مبنية من البيانات الفعلية + القائمة المعتمدة. */
  const gradeOptions = useMemo(
    () => buildSchoolGradeOptions(students, [gradeFilter]),
    [students, gradeFilter],
  );

  const filtered = useMemo(() => {
    const q = query.trim().replace(/\s+/g, " ");
    return students
      .filter((s) => (teacherFilter === "all" ? true : (s.teacher || "").trim() === teacherFilter))
      .filter((s) => (genderFilter === "all" ? true : (s.gender || "") === genderFilter))
      .filter((s) => (statusFilter === "all" ? true : (s.status || "طبيعي") === statusFilter))
      .filter((s) => matchesSchoolGrade(s.school_grade, gradeFilter))
      .filter((s) => (q ? (s.name || "").includes(q) : true))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
  }, [students, query, teacherFilter, genderFilter, statusFilter, gradeFilter]);

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
          <div className="flex items-start gap-2 rounded-2xl border border-amber-300/70 bg-amber-50/70 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              يوجد <strong>{duplicatesTotal}</strong> سجل بأسماء مكررة (بعد تجاهل التشكيل واختلاف
              الألف والياء والتاء المربوطة). راجعها من شارة «مكرر» بجانب الاسم — قد تكون إدخالاً
              مزدوجاً للطالب/ة نفسه.
            </p>
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
              placeholder="ابحث باسم الطالب/الطالبة..."
              className="pr-9"
            />
          </div>
          <Button
            variant="outline"
            className="gap-1"
            onClick={() => void exportExcel()}
            disabled={exporting}
          >
            <Download className="h-4 w-4" /> {exporting ? "جارٍ التصدير..." : "تصدير Excel"}
          </Button>
          <Button className="gap-1" onClick={openAdd} disabled={readOnly}>
            <Plus className="h-4 w-4" /> إضافة طالب/طالبة
          </Button>
        </div>

        {/* الجدول الرسمي — كل الأعوام */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            لا يوجد طلاب وطالبات مطابقون
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[1.5rem] border border-white/70 bg-card/90 shadow-xl shadow-primary/5">
            <table className="w-full text-sm">
              <thead className="bg-primary/5">
                <tr>
                  <th className="px-3 py-2 text-right">#</th>
                  <th className="px-3 py-2 text-right">الاسم</th>
                  <th className="px-3 py-2 text-center">الجنس</th>
                  <th className="px-3 py-2 text-right">السنة الدراسية</th>
                  <th className="px-3 py-2 text-right">المعلم/المعلمة</th>
                  <th className="px-3 py-2 text-center">الحالة</th>
                  <th className="px-3 py-2 text-center">سنوات التسجيل</th>
                  <th className="px-3 py-2 text-center">الأجزاء (آخر سنة)</th>
                  <th className="px-3 py-2 text-center">المجموع (آخر سنة)</th>
                  <th className="px-3 py-2 text-center">التقدير</th>
                  <th className="px-3 py-2 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const dupCount = getDuplicateCountFor(s.name, duplicateCounts);
                  return (
                    <tr key={s.id} className="border-t border-border hover:bg-muted/40">
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                            <User className="h-4 w-4" />
                          </span>
                          <span>{s.name || "—"}</span>
                          {dupCount > 1 && (
                            <Badge
                              variant="outline"
                              className="border-amber-400 bg-amber-50 text-[10px] font-bold text-amber-700"
                              title={`يوجد ${dupCount} سجلات بالاسم نفسه (بعد التطبيع)`}
                            >
                              مكرر ×{dupCount}
                            </Badge>
                          )}
                        </div>
                        {s.notes && (
                          <p className="mt-0.5 pr-9 text-[11px] leading-4 text-muted-foreground">
                            {s.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">{s.gender || "—"}</td>
                      <td className="px-3 py-2">{s.school_grade || "—"}</td>
                      <td className="px-3 py-2">{s.teacher || "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {s.status && s.status !== "طبيعي" ? (
                          <Badge variant="secondary">{s.status}</Badge>
                        ) : (
                          <span className="text-muted-foreground">{s.status || "طبيعي"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {s.years.length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            {s.years.map((y) => (
                              <Badge key={y} variant="outline" className="text-xs">
                                {y}هـ
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">{s.yearData?.parts || "0"}</td>
                      <td className="px-3 py-2 text-center">{s.yearData?.total || "0"}</td>
                      <td className="px-3 py-2 text-center">
                        {s.yearData?.grade ? (
                          <Badge variant="secondary">{s.yearData.grade}</Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openEdit(s)}
                            disabled={readOnly}
                            title="تعديل الملف"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void remove(s)}
                            disabled={readOnly}
                            title="حذف"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuLabel>روابط سريعة — {s.name}</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => goTo("/search", s.name)}>
                                <Trophy className="h-4 w-4 ml-2" /> المسابقة الرمضانية (كل الأعوام)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => goTo("/monthly-search", s.name)}>
                                <Sparkles className="h-4 w-4 ml-2" /> المتابعة الشهرية (كل الأعوام)
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
            </table>
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
    </div>
  );
};

export default Students;
