import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@/lib/router-compat";
import { ArrowRight, BookMarked, Plus, Pencil, Trash2, Save, Users } from "lucide-react";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";

type CourseStatus = "active" | "finished" | "cancelled";

interface CourseRow {
  id: string;
  name: string;
  category: string;
  instructor: string | null;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
  status: CourseStatus;
  notes: string | null;
}

const CATEGORIES = ["خياطة", "قيادة", "نقش", "روضة أطفال", "أخرى"];
const STATUS_LABELS: Record<CourseStatus, string> = { active: "نشطة", finished: "منتهية", cancelled: "ملغاة" };

const emptyForm = () => ({
  name: "", category: CATEGORIES[0], instructor: "", start_date: "", end_date: "",
  capacity: "", status: "active" as CourseStatus, notes: "",
});

const Courses = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<CourseRow[]>([]);
  const [enrollCounts, setEnrollCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("training_courses")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "تعذّر تحميل الدورات", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const list = (data as CourseRow[]) || [];
    setRows(list);
    if (list.length > 0) {
      const { data: enrollments } = await supabase
        .from("training_enrollments")
        .select("course_id")
        .eq("user_id", user.id)
        .in("course_id", list.map((c) => c.id));
      const counts: Record<string, number> = {};
      (enrollments || []).forEach((e: { course_id: string }) => {
        counts[e.course_id] = (counts[e.course_id] || 0) + 1;
      });
      setEnrollCounts(counts);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const openAdd = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (r: CourseRow) => {
    setEditingId(r.id);
    setForm({
      name: r.name, category: r.category, instructor: r.instructor || "",
      start_date: r.start_date || "", end_date: r.end_date || "",
      capacity: r.capacity ? String(r.capacity) : "", status: r.status, notes: r.notes || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.name.trim()) {
      toast({ title: "اسم الدورة مطلوب", variant: "destructive" });
      return;
    }
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      category: form.category,
      instructor: form.instructor.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      capacity: form.capacity ? Number(form.capacity) : null,
      status: form.status,
      notes: form.notes.trim() || null,
    };
    const { error } = editingId
      ? await supabase.from("training_courses").update(payload).eq("id", editingId)
      : await supabase.from("training_courses").insert(payload);
    if (error) {
      toast({ title: "تعذّر الحفظ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "تم التعديل" : "تمت الإضافة" });
    setDialogOpen(false);
    await load();
  };

  const remove = async (r: CourseRow) => {
    if (!confirm(`حذف دورة "${r.name}"؟ سيتم إلغاء تسجيل كل المتدربات منها.`)) return;
    const { error } = await supabase.from("training_courses").delete().eq("id", r.id);
    if (error) {
      toast({ title: "تعذّر الحذف", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم الحذف", variant: "destructive" });
    await load();
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(24_90%_55%/0.16),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.45))]" dir="rtl">
      <header className="mx-3 mt-3 rounded-[2rem] bg-gradient-to-br from-amber-600 via-orange-700 to-rose-900 px-4 py-5 text-white shadow-2xl shadow-amber-900/20">
        <div className="container mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-4">
            <Link to="/training">
              <Button variant="ghost" size="sm" className="text-white gap-1">
                <ArrowRight className="h-4 w-4" /> رجوع لقسم التدريب
              </Button>
            </Link>
            <img src={logo} alt="الشعار" className="h-16 w-auto" />
            <div className="w-24" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
              <BookMarked className="h-6 w-6" /> الدورات
            </h1>
            <p className="text-sm opacity-90 mt-1">{rows.length} دورة</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-7 space-y-4">
        <div className="flex justify-end">
          <Button className="gap-1" onClick={openAdd}><Plus className="h-4 w-4" /> دورة جديدة</Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">لا توجد دورات بعد</div>
        ) : (
          <div className="overflow-x-auto rounded-[1.5rem] border border-white/70 bg-card/90 shadow-xl shadow-primary/5">
            <table className="w-full text-sm">
              <thead className="bg-amber-500/10">
                <tr>
                  <th className="px-3 py-2 text-right">#</th>
                  <th className="px-3 py-2 text-right">اسم الدورة</th>
                  <th className="px-3 py-2 text-right">الفئة</th>
                  <th className="px-3 py-2 text-right">المدرب/ة</th>
                  <th className="px-3 py-2 text-center">التواريخ</th>
                  <th className="px-3 py-2 text-center">المسجلون</th>
                  <th className="px-3 py-2 text-center">الحالة</th>
                  <th className="px-3 py-2 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2"><Badge variant="secondary">{r.category}</Badge></td>
                    <td className="px-3 py-2">{r.instructor || "—"}</td>
                    <td className="px-3 py-2 text-center text-xs">
                      {r.start_date || "—"} {r.end_date ? `→ ${r.end_date}` : ""}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {enrollCounts[r.id] || 0}
                        {r.capacity ? ` / ${r.capacity}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={r.status === "active" ? "default" : "outline"}>{STATUS_LABELS[r.status]}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="destructive" onClick={() => void remove(r)}><Trash2 className="h-3 w-3" /></Button>
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
            <DialogTitle>{editingId ? "تعديل دورة" : "إضافة دورة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">اسم الدورة</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">الفئة</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">المدرب/ة</label>
                <Input value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">السعة (اختياري)</label>
                <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">تاريخ البداية</label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">تاريخ النهاية</label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">الحالة</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as CourseStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">ملاحظات</label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={() => void save()} className="gap-1"><Save className="h-4 w-4" /> حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Courses;
