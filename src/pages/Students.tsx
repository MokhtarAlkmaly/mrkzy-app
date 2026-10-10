import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "@/lib/router-compat";
import {
  GraduationCap, Search as SearchIcon, Calendar, Plus, Pencil, Trash2, Save,
  Trophy, Sparkles, Home as HomeIcon, Globe2, Award, ScrollText, MoreVertical, User, FileText,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { Student, START_YEAR, END_YEAR } from "@/types/student";
import {
  loadAllStudentsWithData, loadTeachers, getActiveYear, setActiveYear,
  saveStudent, deleteStudent, registerStudentInYear,
} from "@/utils/storage";
import { setPendingStudentLink } from "@/utils/studentLink";

const emptyForm = () => ({ name: "", teacher: "" });

const Students = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [currentYear, setCurrentYear] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [teacherNames, setTeacherNames] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(async () => {
    if (!currentYear) return;
    setLoading(true);
    const [list, registered] = await Promise.all([
      loadAllStudentsWithData(currentYear),
      loadTeachers(currentYear),
    ]);
    setStudents(list);
    const set = new Set<string>(registered.map((r) => r.name));
    list.forEach((s) => { const t = (s.teacher || "").trim(); if (t) set.add(t); });
    setTeacherNames(Array.from(set).sort((a, b) => a.localeCompare(b, "ar")));
    setLoading(false);
  }, [currentYear]);

  useEffect(() => {
    void (async () => setCurrentYear(await getActiveYear()))();
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().replace(/\s+/g, " ");
    return students
      .filter((s) => (teacherFilter === "all" ? true : (s.teacher || "").trim() === teacherFilter))
      .filter((s) => (q ? (s.name || "").includes(q) : true))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
  }, [students, query, teacherFilter]);

  const goTo = (path: string, studentName: string) => {
    setPendingStudentLink(studentName);
    navigate(path);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditingId(s.id);
    setForm({ name: s.name || "", teacher: s.teacher || "" });
    setDialogOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      toast({ title: "اسم الطالبة مطلوب", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await saveStudent({ id: editingId, name, teacher: form.teacher.trim() });
        toast({ title: "تم تعديل بيانات الطالبة" });
      } else {
        const newId = await saveStudent({ name, teacher: form.teacher.trim() });
        if (newId) {
          await registerStudentInYear(currentYear, newId, form.teacher.trim());
        }
        toast({ title: "تمت إضافة الطالبة", description: `تم تسجيل ${name} في سجل عام ${currentYear}هـ` });
      }
      setDialogOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Student) => {
    if (!confirm(`هل أنت متأكد من حذف الطالبة "${s.name}"؟ سيتم حذف كل بياناتها (الحفظ، الدرجات) نهائيًا.`)) return;
    await deleteStudent(s.id);
    toast({ title: "تم الحذف", variant: "destructive" });
    await load();
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.45))]" dir="rtl">
      <header className="mx-3 mt-3 rounded-[2rem] bg-gradient-to-br from-primary via-emerald-700 to-teal-950 px-4 py-5 text-primary-foreground shadow-2xl shadow-primary/20">
        <div className="container mx-auto max-w-7xl">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img src={logo} alt="الشعار" className="h-16 w-auto" />
          </div>
          <div className="text-center">
            <p className="text-xs opacity-80">مركز إنماء الأهلي الخيري</p>
            <h1 className="text-2xl font-bold flex items-center justify-center gap-2 mt-1">
              <GraduationCap className="h-6 w-6" /> السجل الرسمي للطالبات
            </h1>
            <p className="text-sm opacity-90 mt-1">عام {currentYear}هـ — {filtered.length} طالبة مسجّلة</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-7 space-y-4">
        {/* أدوات البحث والتصفية والإضافة */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={currentYear} onValueChange={(v) => { setCurrentYear(v); void setActiveYear(v); }}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i).map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}هـ</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={teacherFilter} onValueChange={setTeacherFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="كل المعلمات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المعلمات</SelectItem>
              {teacherNames.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[180px]">
            <SearchIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم الطالبة..."
              className="pr-9"
            />
          </div>
          <Button className="gap-1" onClick={openAdd}><Plus className="h-4 w-4" /> إضافة طالبة</Button>
        </div>

        {/* الجدول الرسمي */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">لا توجد طالبات مطابقة</div>
        ) : (
          <div className="overflow-x-auto rounded-[1.5rem] border border-white/70 bg-card/90 shadow-xl shadow-primary/5">
            <table className="w-full text-sm">
              <thead className="bg-primary/5">
                <tr>
                  <th className="px-3 py-2 text-right">#</th>
                  <th className="px-3 py-2 text-right">اسم الطالبة</th>
                  <th className="px-3 py-2 text-right">المعلمة</th>
                  <th className="px-3 py-2 text-center">الأجزاء</th>
                  <th className="px-3 py-2 text-center">المجموع</th>
                  <th className="px-3 py-2 text-center">الترتيب</th>
                  <th className="px-3 py-2 text-center">التقدير</th>
                  <th className="px-3 py-2 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={s.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                        <User className="h-4 w-4" />
                      </span>
                      {s.name || "—"}
                    </td>
                    <td className="px-3 py-2">{s.teacher || "—"}</td>
                    <td className="px-3 py-2 text-center">{s.yearData?.parts || "0"}</td>
                    <td className="px-3 py-2 text-center">{s.yearData?.total || "0"}</td>
                    <td className="px-3 py-2 text-center">{s.yearData?.rank || "-"}</td>
                    <td className="px-3 py-2 text-center">
                      {s.yearData?.grade ? <Badge variant="secondary">{s.yearData.grade}</Badge> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(s)} title="تعديل">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void remove(s)} title="حذف">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost"><MoreVertical className="h-4 w-4" /></Button>
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
                            <DropdownMenuItem onClick={() => goTo("/internal-competition", s.name)}>
                              <HomeIcon className="h-4 w-4 ml-2" /> إضافة نتيجة مسابقة داخلية
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => goTo("/external-competition", s.name)}>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل بيانات طالبة" : "إضافة طالبة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">اسم الطالبة</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الاسم الكامل" />
            </div>
            <div>
              <label className="text-sm font-medium">المعلمة</label>
              {teacherNames.length > 0 ? (
                <Select value={form.teacher} onValueChange={(v) => setForm({ ...form, teacher: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر المعلمة" /></SelectTrigger>
                  <SelectContent>
                    {teacherNames.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} placeholder="اسم المعلمة" />
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
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
