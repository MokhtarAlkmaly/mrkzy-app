import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Link } from "@/lib/router-compat";
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  Calendar,
  Trophy,
  Globe2,
  Home as HomeIcon,
} from "lucide-react";
import { CenterHeader } from "@/components/CenterHeader";
import { Student, START_YEAR, END_YEAR } from "@/types/student";
import { loadGlobalStudents, getActiveYear, setActiveYear } from "@/utils/storage";
import { supabase } from "@/integrations/supabase/client";
import { consumePendingStudentLink } from "@/utils/studentLink";

type CompetitionType = "internal" | "external";

interface CompetitionRow {
  id: string;
  year: string;
  competition_type: CompetitionType;
  student_name: string;
  title: string;
  organizer: string | null;
  rank: string;
  score: string;
  held_at: string;
  notes: string | null;
}

const emptyForm = () => ({
  student_name: "",
  title: "",
  organizer: "",
  rank: "",
  score: "",
  held_at: new Date().toISOString().slice(0, 10),
  notes: "",
});

interface Props {
  type: CompetitionType;
}

const StudentCompetition = ({ type }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentYear, setCurrentYear] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [rows, setRows] = useState<CompetitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const isExternal = type === "external";
  const title = isExternal ? "المسابقة الخارجية" : "المسابقة الداخلية";
  const Icon = isExternal ? Globe2 : HomeIcon;

  const load = useCallback(async () => {
    if (!currentYear || !user) return;
    setLoading(true);
    const [list, { data, error }] = await Promise.all([
      loadAllStudentsSafe(),
      supabase
        .from("student_competitions")
        .select("*")
        .eq("user_id", user.id)
        .eq("year", currentYear)
        .eq("competition_type", type)
        .order("held_at", { ascending: false }),
    ]);
    setStudents(list);
    if (error) {
      toast({ title: "تعذّر تحميل البيانات", description: error.message, variant: "destructive" });
    } else {
      setRows((data as CompetitionRow[]) || []);
    }
    setLoading(false);
  }, [currentYear, user, type, toast]);

  const loadAllStudentsSafe = async () => {
    try {
      return await loadGlobalStudents();
    } catch {
      return [];
    }
  };

  useEffect(() => {
    void (async () => setCurrentYear(await getActiveYear()))();
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // فتح نافذة الإضافة تلقائيًا إن جاء المستخدم من "صفحة الطلاب والطالبات" باسم طالب/طالبة محددة
  useEffect(() => {
    if (loading) return;
    const pendingName = consumePendingStudentLink();
    if (pendingName) {
      setForm({ ...emptyForm(), student_name: pendingName });
      setEditingId(null);
      setDialogOpen(true);
    }
  }, [loading]);

  const studentNames = useMemo(
    () =>
      students
        .map((s) => s.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ar")),
    [students],
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (r: CompetitionRow) => {
    setEditingId(r.id);
    setForm({
      student_name: r.student_name,
      title: r.title,
      organizer: r.organizer || "",
      rank: r.rank,
      score: r.score,
      held_at: r.held_at,
      notes: r.notes || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.student_name.trim()) {
      toast({ title: "اسم الطالب/الطالبة مطلوب", variant: "destructive" });
      return;
    }
    const payload = {
      user_id: user.id,
      year: currentYear,
      competition_type: type,
      student_name: form.student_name.trim(),
      title: form.title.trim(),
      organizer: form.organizer.trim() || null,
      rank: form.rank.trim(),
      score: form.score.trim(),
      held_at: form.held_at,
      notes: form.notes.trim() || null,
    };
    const { error } = editingId
      ? await supabase.from("student_competitions").update(payload).eq("id", editingId)
      : await supabase.from("student_competitions").insert(payload);
    if (error) {
      toast({ title: "تعذّر الحفظ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "تم التعديل" : "تمت الإضافة" });
    setDialogOpen(false);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذا السجل؟")) return;
    const { error } = await supabase.from("student_competitions").delete().eq("id", id);
    if (error) {
      toast({ title: "تعذّر الحذف", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم الحذف", variant: "destructive" });
    await load();
  };

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.45))]"
      dir="rtl"
    >
      <CenterHeader
        title={title}
        icon={Icon}
        backTo="/students"
        backLabel="رجوع لصفحة الطلاب والطالبات"
        subtitle={`عام ${currentYear}هـ — ${rows.length} سجل`}
      />

      <div className="container mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-7 space-y-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">العام:</span>
            <Select
              value={currentYear}
              onValueChange={(v) => {
                setCurrentYear(v);
                void setActiveYear(v);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i).map(
                  (y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}هـ
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <Button className="gap-1" onClick={openAdd}>
            <Plus className="h-4 w-4" /> إضافة سجل
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">لا توجد سجلات لهذا العام</div>
        ) : (
          <div className="overflow-x-auto rounded-[1.5rem] border border-white/70 bg-card/90 shadow-xl shadow-primary/5">
            <table className="w-full text-sm">
              <thead className="bg-primary/5">
                <tr>
                  <th className="px-3 py-2 text-right">#</th>
                  <th className="px-3 py-2 text-right">الطالب/الطالبة</th>
                  <th className="px-3 py-2 text-right">عنوان المسابقة</th>
                  <th className="px-3 py-2 text-right">الجهة المنظمة</th>
                  <th className="px-3 py-2 text-center">الترتيب</th>
                  <th className="px-3 py-2 text-center">الدرجة</th>
                  <th className="px-3 py-2 text-center">التاريخ</th>
                  <th className="px-3 py-2 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{r.student_name}</td>
                    <td className="px-3 py-2">{r.title || "—"}</td>
                    <td className="px-3 py-2">{r.organizer || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {r.rank ? (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                          <Trophy className="h-3 w-3" />
                          {r.rank}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">{r.score || "—"}</td>
                    <td className="px-3 py-2 text-center text-xs">{r.held_at}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void remove(r.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
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
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل سجل" : `إضافة سجل — ${title}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">اسم الطالب/الطالبة</label>
              {studentNames.length > 0 ? (
                <Select
                  value={form.student_name}
                  onValueChange={(v) => setForm({ ...form, student_name: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الطالب/الطالبة" />
                  </SelectTrigger>
                  <SelectContent>
                    {studentNames.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={form.student_name}
                  onChange={(e) => setForm({ ...form, student_name: e.target.value })}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">عنوان المسابقة</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">الجهة المنظمة</label>
                <Input
                  value={form.organizer}
                  onChange={(e) => setForm({ ...form, organizer: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">الترتيب</label>
                <Input
                  value={form.rank}
                  onChange={(e) => setForm({ ...form, rank: e.target.value })}
                  placeholder="مثال: الأول"
                />
              </div>
              <div>
                <label className="text-sm font-medium">الدرجة</label>
                <Input
                  value={form.score}
                  onChange={(e) => setForm({ ...form, score: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">التاريخ</label>
                <Input
                  type="date"
                  value={form.held_at}
                  onChange={(e) => setForm({ ...form, held_at: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">ملاحظات</label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => void save()} className="gap-1">
              <Save className="h-4 w-4" /> حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentCompetition;
