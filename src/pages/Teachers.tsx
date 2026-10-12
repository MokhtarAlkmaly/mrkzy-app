import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Eye,
  Gift,
  Save,
  Calendar,
  Users,
  Pencil,
  Plus,
  Trash2,
  Search,
  GraduationCap,
  BookOpenCheck,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { START_YEAR, END_YEAR } from "@/types/student";
import {
  getActiveYear,
  setActiveYear,
  saveStudent,
  saveYearData,
  syncToCloud,
  loadTeachers,
  saveTeacher,
  deleteTeacherLocal,
  loadTeacherBonuses,
  saveTeacherBonus,
  loadTeacherAssignmentsAllYears,
  type TeacherYearAssignment,
} from "@/utils/storage";

const HIJRI_MONTHS = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
];

interface BonusRow {
  id: string;
  teacher_name: string;
  year: string;
  month: number;
  amount: number;
}

interface RegisteredRow {
  id: string;
  name: string;
  year: string;
}

interface TeacherAggregate {
  name: string;
  registered: boolean;
  registeredRows: RegisteredRow[];
  assignments: TeacherYearAssignment[];
  studentCount: number;
  years: string[];
  totalParts: number;
}

const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => String(START_YEAR + i));

const compareYears = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

const toNumber = (v: string | undefined | null) => parseFloat(v || "0") || 0;

const Teachers = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeYear, setActiveYearState] = useState<string>("");
  const [assignments, setAssignments] = useState<TeacherYearAssignment[]>([]);
  const [bonuses, setBonuses] = useState<BonusRow[]>([]);
  const [registered, setRegistered] = useState<RegisteredRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // edit dialog
  const [editTeacher, setEditTeacher] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // view students dialog
  const [viewTeacher, setViewTeacher] = useState<string | null>(null);

  // bonus dialog
  const [bonusTeacher, setBonusTeacher] = useState<string | null>(null);
  const [bonusYear, setBonusYear] = useState<string>("");
  const [bonusMonth, setBonusMonth] = useState<number>(1);
  const [bonusAmount, setBonusAmount] = useState<string>("0");

  // add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherYear, setNewTeacherYear] = useState<string>("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    const list = await loadTeacherAssignmentsAllYears();
    setAssignments(list);
    if (user) {
      const [bonusData, regData] = await Promise.all([loadTeacherBonuses(), loadTeachers()]);
      setBonuses(bonusData as BonusRow[]);
      setRegistered(regData.map((r) => ({ id: r.id, name: r.name, year: r.year })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void (async () => {
      const y = await getActiveYear();
      setActiveYearState(y);
      setBonusYear(y);
      setNewTeacherYear(y);
    })();
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleYearChange = async (y: string) => {
    setActiveYearState(y);
    await setActiveYear(y);
  };

  const teachers = useMemo<TeacherAggregate[]>(() => {
    const map = new Map<string, TeacherAggregate>();
    const ensure = (name: string) => {
      let t = map.get(name);
      if (!t) {
        t = {
          name,
          registered: false,
          registeredRows: [],
          assignments: [],
          studentCount: 0,
          years: [],
          totalParts: 0,
        };
        map.set(name, t);
      }
      return t;
    };
    for (const r of registered) {
      const t = ensure(r.name);
      t.registered = true;
      t.registeredRows.push(r);
    }
    for (const a of assignments) {
      ensure(a.teacher).assignments.push(a);
    }
    for (const t of map.values()) {
      t.studentCount = new Set(t.assignments.map((a) => a.student_id)).size;
      t.totalParts = t.assignments.reduce((sum, a) => sum + toNumber(a.yearData.parts), 0);
      const years = new Set<string>();
      t.registeredRows.forEach((r) => r.year && years.add(r.year));
      t.assignments.forEach((a) => a.year && years.add(a.year));
      t.years = Array.from(years).sort(compareYears);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [assignments, registered]);

  const filteredTeachers = useMemo(() => {
    const q = query.trim().replace(/\s+/g, " ");
    return q ? teachers.filter((t) => t.name.includes(q)) : teachers;
  }, [teachers, query]);

  const summary = useMemo(() => {
    const uniqueStudents = new Set(assignments.map((a) => a.student_id)).size;
    const years = new Set<string>();
    teachers.forEach((t) => t.years.forEach((y) => years.add(y)));
    const totalBonuses = bonuses.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    return { uniqueStudents, yearsCount: years.size, totalBonuses };
  }, [assignments, teachers, bonuses]);

  const totalBonusFor = (teacher: string) =>
    bonuses
      .filter((b) => b.teacher_name === teacher)
      .reduce((sum, b) => sum + Number(b.amount || 0), 0);

  const openBonus = (teacher: string) => {
    setBonusTeacher(teacher);
    setBonusYear(activeYear);
    setBonusMonth(1);
    const existing = bonuses.find(
      (b) => b.teacher_name === teacher && b.year === activeYear && b.month === 1,
    );
    setBonusAmount(existing ? String(existing.amount) : "0");
  };

  // Update amount field when year/month changes inside dialog
  useEffect(() => {
    if (!bonusTeacher) return;
    const existing = bonuses.find(
      (b) => b.teacher_name === bonusTeacher && b.year === bonusYear && b.month === bonusMonth,
    );
    setBonusAmount(existing ? String(existing.amount) : "0");
  }, [bonusYear, bonusMonth, bonusTeacher, bonuses]);

  const saveBonus = async () => {
    if (!user || !bonusTeacher) return;
    const amount = parseFloat(bonusAmount) || 0;
    await saveTeacherBonus({
      teacher_name: bonusTeacher,
      year: bonusYear,
      month: bonusMonth,
      amount,
    });
    toast({
      title: "تم الحفظ",
      description: `إكرامية ${HIJRI_MONTHS[bonusMonth - 1]} ${bonusYear}هـ`,
    });
    setBonuses((await loadTeacherBonuses()) as BonusRow[]);
  };

  const openEdit = (teacher: string) => {
    setEditTeacher(teacher);
    setEditName(teacher);
  };

  const saveEdit = async () => {
    if (!editTeacher) return;
    const newName = editName.trim();
    if (!newName || newName === editTeacher) {
      setEditTeacher(null);
      return;
    }
    const target = teachers.find((t) => t.name === editTeacher);
    const affected = target?.assignments ?? [];
    const touchedStudents = new Set<number>();
    for (const a of affected) {
      if (a.year) {
        await saveYearData(a.year, a.student_id, { ...a.yearData, teacher: newName });
      }
      if (!touchedStudents.has(a.student_id)) {
        touchedStudents.add(a.student_id);
        await saveStudent({ id: a.student_id, name: a.name, teacher: newName });
      }
    }
    const relatedBonuses = (await loadTeacherBonuses()).filter(
      (b) => b.teacher_name === editTeacher,
    );
    for (const b of relatedBonuses) {
      await saveTeacherBonus({ ...b, teacher_name: newName });
    }
    const relatedTeachers = (await loadTeachers()).filter((t) => t.name === editTeacher);
    for (const t of relatedTeachers) {
      await saveTeacher({ ...t, name: newName });
    }
    await syncToCloud();
    setEditTeacher(null);
    toast({
      title: "تم التعديل",
      description: `تم تحديث اسم المعلم/المعلمة في جميع الأعوام (${touchedStudents.size} طالب/طالبة)`,
    });
    await loadAll();
  };

  const addTeacher = async () => {
    if (!user) return;
    const name = newTeacherName.trim();
    const year = newTeacherYear || activeYear;
    if (!name || !year) return;
    await saveTeacher({ year, name });
    toast({ title: "تمت الإضافة", description: `${name} — ${year}هـ` });
    setNewTeacherName("");
    setAddOpen(false);
    await loadAll();
  };

  const deleteTeacher = async (t: TeacherAggregate) => {
    if (!user) return;
    const studentCount = t.studentCount;
    const msg =
      studentCount > 0
        ? `حذف "${t.name}" من قائمة المعلمين والمعلمات في جميع الأعوام؟ (يوجد ${studentCount} طالب/طالبة مرتبطة، سيتم تفريغ خانة المعلم/المعلمة لديهم في كل الأعوام)`
        : `حذف "${t.name}" من قائمة المعلمين والمعلمات في جميع الأعوام؟`;
    if (!confirm(msg)) return;
    for (const r of t.registeredRows) {
      await deleteTeacherLocal(r.id);
    }
    // clear teacher from students in every year
    const clearedStudents = new Set<number>();
    for (const a of t.assignments) {
      if (a.year) {
        await saveYearData(a.year, a.student_id, { ...a.yearData, teacher: "" });
      }
      if (!clearedStudents.has(a.student_id)) {
        clearedStudents.add(a.student_id);
        await saveStudent({ id: a.student_id, name: a.name, teacher: "" });
      }
    }
    await syncToCloud();
    toast({ title: "تم الحذف", description: t.name, variant: "destructive" });
    await loadAll();
  };

  const viewRows = useMemo(() => {
    if (!viewTeacher) return [];
    const t = teachers.find((x) => x.name === viewTeacher);
    return (t?.assignments ?? [])
      .slice()
      .sort(
        (a, b) => compareYears(b.year || "", a.year || "") || a.name.localeCompare(b.name, "ar"),
      );
  }, [viewTeacher, teachers]);

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
              <Users className="h-6 w-6" /> المعلمون والمعلمات
            </h1>
            <p className="text-sm opacity-90 mt-1">
              جميع الأعوام — {filteredTeachers.length} معلم/معلمة
            </p>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-7 space-y-4">
        {/* بطاقات إحصائية سريعة */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/70 bg-card/90 p-3.5 shadow-lg shadow-primary/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                إجمالي المعلمين والمعلمات
              </span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-primary">{teachers.length}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">في كل الأعوام</div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-card/90 p-3.5 shadow-lg shadow-primary/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                الطلاب والطالبات المرتبطون
              </span>
              <GraduationCap className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-emerald-700">
              {summary.uniqueStudents}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">طالب/طالبة بمعلم/معلمة</div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-card/90 p-3.5 shadow-lg shadow-primary/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">إجمالي الإكراميات</span>
              <Gift className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-amber-600">
              {summary.totalBonuses.toLocaleString("ar-EG")}
              <span className="mr-1 text-xs font-normal text-muted-foreground">ريال</span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">كل الأعوام</div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-card/90 p-3.5 shadow-lg shadow-primary/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">الأعوام المسجلة</span>
              <BookOpenCheck className="h-4 w-4 text-sky-700" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-sky-700">{summary.yearsCount}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              عام الحالي: {activeYear}هـ
            </div>
          </div>
        </div>

        {/* أدوات البحث والإضافة */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="بحث باسم المعلم/المعلمة"
                className="w-64 pr-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">العام الحالي</span>
              <Select value={activeYear} onValueChange={(v) => void handleYearChange(v)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}هـ
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="gap-1"
            onClick={() => {
              setNewTeacherYear(activeYear);
              setAddOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            إضافة معلم/معلمة
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
        ) : filteredTeachers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {teachers.length === 0
              ? "لا يوجد معلمون ومعلمات مسجّلون في أي عام"
              : "لا توجد نتائج مطابقة للبحث"}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[1.5rem] border border-white/70 bg-card/90 shadow-xl shadow-primary/5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-primary text-primary-foreground">
                  <tr>
                    <th className="px-3 py-3 text-right">#</th>
                    <th className="px-3 py-3 text-right">اسم المعلم/المعلمة</th>
                    <th className="px-3 py-3 text-center">الحالة</th>
                    <th className="px-3 py-3 text-center">الأعوام</th>
                    <th className="px-3 py-3 text-center">عدد الطلاب والطالبات</th>
                    <th className="px-3 py-3 text-center">مجموع الأجزاء</th>
                    <th className="px-3 py-3 text-center">إجمالي الإكراميات (كل الأعوام)</th>
                    <th className="px-3 py-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeachers.map((t, i) => (
                    <tr key={t.name} className="border-t border-border hover:bg-muted/40">
                      <td className="px-3 py-3 text-right font-bold">{i + 1}</td>
                      <td className="px-3 py-3 text-right font-semibold">{t.name}</td>
                      <td className="px-3 py-3 text-center">
                        {t.registered ? (
                          <span className="text-success font-semibold">مسجلة</span>
                        ) : (
                          <span className="text-amber-600 font-semibold">
                            من بيانات الطلاب والطالبات
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {t.years.length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            {t.years.map((y) => (
                              <Badge key={y} variant="outline" className="text-[11px]">
                                {y}هـ
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">{t.studentCount}</td>
                      <td className="px-3 py-3 text-center">
                        {t.totalParts.toLocaleString("ar-EG")}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-primary">
                        {totalBonusFor(t.name).toLocaleString()} ريال
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2 justify-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => setViewTeacher(t.name)}
                          >
                            <Eye className="h-4 w-4" />
                            عرض الطلاب والطالبات
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => openBonus(t.name)}
                          >
                            <Gift className="h-4 w-4" />
                            الإكرامية الشهرية
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="gap-1"
                            onClick={() => openEdit(t.name)}
                          >
                            <Pencil className="h-4 w-4" />
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1"
                            onClick={() => deleteTeacher(t)}
                          >
                            <Trash2 className="h-4 w-4" />
                            حذف
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add teacher dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة معلم/معلمة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">العام</label>
              <Select value={newTeacherYear} onValueChange={setNewTeacherYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}هـ
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="text-sm font-medium">اسم المعلم/المعلمة</label>
            <Input
              autoFocus
              value={newTeacherName}
              onChange={(e) => setNewTeacherName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addTeacher();
              }}
              placeholder="مثال: أم عبدالله"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => void addTeacher()} className="gap-1">
              <Save className="h-4 w-4" />
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View students dialog (all years) */}
      <Dialog open={!!viewTeacher} onOpenChange={(o) => !o && setViewTeacher(null)}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>طلاب وطالبات المعلم/المعلمة: {viewTeacher} — كل الأعوام</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-2 py-2 text-right">#</th>
                  <th className="px-2 py-2 text-right">الاسم</th>
                  <th className="px-2 py-2 text-center">العام</th>
                  <th className="px-2 py-2 text-center">الأجزاء</th>
                  <th className="px-2 py-2 text-center">المجموع</th>
                  <th className="px-2 py-2 text-center">الترتيب</th>
                </tr>
              </thead>
              <tbody>
                {viewRows.map((s, i) => (
                  <tr key={`${s.student_id}-${s.year}`} className="border-t border-border">
                    <td className="px-2 py-2 text-right">{i + 1}</td>
                    <td className="px-2 py-2 text-right font-medium">{s.name || "—"}</td>
                    <td className="px-2 py-2 text-center">{s.year ? `${s.year}هـ` : "—"}</td>
                    <td className="px-2 py-2 text-center">{s.yearData.parts || "—"}</td>
                    <td className="px-2 py-2 text-center">{s.yearData.total || "0"}</td>
                    <td className="px-2 py-2 text-center">{s.yearData.rank || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit teacher dialog */}
      <Dialog open={!!editTeacher} onOpenChange={(o) => !o && setEditTeacher(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل اسم المعلم/المعلمة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">الاسم الجديد</label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              سيتم تحديث الاسم لجميع الطلاب والطالبات والإكراميات المرتبطة في كل الأعوام.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTeacher(null)}>
              إلغاء
            </Button>
            <Button onClick={() => void saveEdit()} className="gap-1">
              <Save className="h-4 w-4" />
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bonus dialog */}
      <Dialog open={!!bonusTeacher} onOpenChange={(o) => !o && setBonusTeacher(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-600" />
              إكرامية شهرية — {bonusTeacher}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Calendar className="h-4 w-4" /> العام الهجري
              </label>
              <Select value={bonusYear} onValueChange={setBonusYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i).map(
                    (y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}هـ
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">الشهر</label>
              <Select value={String(bonusMonth)} onValueChange={(v) => setBonusMonth(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HIJRI_MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">المبلغ (ريال)</label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={bonusAmount}
                onChange={(e) => setBonusAmount(e.target.value)}
              />
            </div>

            <div className="bg-muted/50 rounded-md p-3 text-sm space-y-2">
              <div>
                <div className="font-semibold mb-1">إجمالي إكراميات {bonusYear}هـ:</div>
                <div className="text-primary font-bold text-lg">
                  {bonuses
                    .filter((b) => b.teacher_name === bonusTeacher && b.year === bonusYear)
                    .reduce((s, b) => s + Number(b.amount || 0), 0)
                    .toLocaleString()}{" "}
                  ريال
                </div>
              </div>
              <div>
                <div className="font-semibold mb-1">إجمالي كل الأعوام:</div>
                <div className="text-amber-700 font-bold">
                  {totalBonusFor(bonusTeacher || "").toLocaleString()} ريال
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBonusTeacher(null)}>
              إغلاق
            </Button>
            <Button
              onClick={() => void saveBonus()}
              className="gap-1 bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Save className="h-4 w-4" /> حفظ الإكرامية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Teachers;
