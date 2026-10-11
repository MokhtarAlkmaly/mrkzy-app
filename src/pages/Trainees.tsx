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
import { Link } from "@/lib/router-compat";
import {
  ArrowRight,
  Users,
  Plus,
  Pencil,
  Trash2,
  Save,
  Search as SearchIcon,
  MoreVertical,
  User,
  BookMarked,
  X,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";

type Gender = "male" | "female";

interface TraineeRow {
  id: string;
  name: string;
  phone: string | null;
  gender: Gender;
  notes: string | null;
}

interface CourseOption {
  id: string;
  name: string;
  status: string;
}

interface EnrollmentInfo {
  id: string;
  course_id: string;
  course_name: string;
  status: string;
}

const emptyForm = () => ({ name: "", phone: "", gender: "female" as Gender, notes: "" });

const Trainees = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<TraineeRow[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [enrollmentsByTrainee, setEnrollmentsByTrainee] = useState<
    Record<string, EnrollmentInfo[]>
  >({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [enrollDialogTrainee, setEnrollDialogTrainee] = useState<TraineeRow | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: trainees, error }, { data: courseList }] = await Promise.all([
      supabase
        .from("trainees")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("training_courses")
        .select("id, name, status")
        .eq("user_id", user.id)
        .order("name"),
    ]);
    if (error) {
      toast({
        title: "تعذّر تحميل المتدربين والمتدربات",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    const list = (trainees as TraineeRow[]) || [];
    setRows(list);
    setCourses((courseList as CourseOption[]) || []);

    if (list.length > 0) {
      const { data: enrollments } = await supabase
        .from("training_enrollments")
        .select("id, trainee_id, course_id, status, training_courses(name)")
        .eq("user_id", user.id)
        .in(
          "trainee_id",
          list.map((t) => t.id),
        );
      const map: Record<string, EnrollmentInfo[]> = {};
      (enrollments || []).forEach((e) => {
        const info: EnrollmentInfo = {
          id: e.id,
          course_id: e.course_id,
          course_name: e.training_courses?.name || "دورة",
          status: e.status,
        };
        if (!map[e.trainee_id]) map[e.trainee_id] = [];
        map[e.trainee_id].push(info);
      });
      setEnrollmentsByTrainee(map);
    } else {
      setEnrollmentsByTrainee({});
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return rows
      .filter((r) => (q ? r.name.includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [rows, query]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };
  const openEdit = (r: TraineeRow) => {
    setEditingId(r.id);
    setForm({ name: r.name, phone: r.phone || "", gender: r.gender, notes: r.notes || "" });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.name.trim()) {
      toast({ title: "الاسم مطلوب", variant: "destructive" });
      return;
    }
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      gender: form.gender,
      notes: form.notes.trim() || null,
    };
    const { error } = editingId
      ? await supabase.from("trainees").update(payload).eq("id", editingId)
      : await supabase.from("trainees").insert(payload);
    if (error) {
      toast({ title: "تعذّر الحفظ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "تم التعديل" : "تمت الإضافة" });
    setDialogOpen(false);
    await load();
  };

  const remove = async (r: TraineeRow) => {
    if (!confirm(`حذف المتدرب/ة "${r.name}"؟`)) return;
    const { error } = await supabase.from("trainees").delete().eq("id", r.id);
    if (error) {
      toast({ title: "تعذّر الحذف", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم الحذف", variant: "destructive" });
    await load();
  };

  const openEnroll = (r: TraineeRow) => {
    setEnrollDialogTrainee(r);
    setSelectedCourseId("");
  };

  const enroll = async () => {
    if (!user || !enrollDialogTrainee || !selectedCourseId) return;
    const { error } = await supabase.from("training_enrollments").insert({
      user_id: user.id,
      trainee_id: enrollDialogTrainee.id,
      course_id: selectedCourseId,
    });
    if (error) {
      toast({
        title: "تعذّر التسجيل",
        description: error.message.includes("duplicate")
          ? "المتدرب/المتدربة مسجّل مسبقًا في هذه الدورة"
          : error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "تم التسجيل في الدورة" });
    setEnrollDialogTrainee(null);
    await load();
  };

  const unenroll = async (enrollmentId: string) => {
    const { error } = await supabase.from("training_enrollments").delete().eq("id", enrollmentId);
    if (error) {
      toast({ title: "تعذّر إلغاء التسجيل", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم إلغاء التسجيل" });
    await load();
  };

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(24_90%_55%/0.16),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.45))]"
      dir="rtl"
    >
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
              <Users className="h-6 w-6" /> السجل الرسمي للمتدربين والمتدربات
            </h1>
            <p className="text-sm opacity-90 mt-1">{filtered.length} مسجّل/ة</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-7 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <SearchIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم..."
              className="pr-9"
            />
          </div>
          <Button className="gap-1" onClick={openAdd}>
            <Plus className="h-4 w-4" /> إضافة متدرب/ة
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">لا يوجد متدربون مطابقون</div>
        ) : (
          <div className="overflow-x-auto rounded-[1.5rem] border border-white/70 bg-card/90 shadow-xl shadow-primary/5">
            <table className="w-full text-sm">
              <thead className="bg-amber-500/10">
                <tr>
                  <th className="px-3 py-2 text-right">#</th>
                  <th className="px-3 py-2 text-right">الاسم</th>
                  <th className="px-3 py-2 text-right">الجوال</th>
                  <th className="px-3 py-2 text-right">الدورات المسجّل بها</th>
                  <th className="px-3 py-2 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 shrink-0">
                        <User className="h-4 w-4" />
                      </span>
                      {r.name}
                    </td>
                    <td className="px-3 py-2">{r.phone || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(enrollmentsByTrainee[r.id] || []).length === 0 && (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {(enrollmentsByTrainee[r.id] || []).map((e) => (
                          <Badge key={e.id} variant="secondary" className="gap-1">
                            {e.course_name}
                            <button
                              onClick={() => void unenroll(e.id)}
                              className="hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void remove(r)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuLabel>{r.name}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openEnroll(r)}>
                              <BookMarked className="h-4 w-4 ml-2" /> تسجيل في دورة
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

      {/* إضافة / تعديل متدرب */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل بيانات متدرب/ة" : "إضافة متدرب/ة جديد/ة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">الاسم الكامل</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">الجوال</label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">الجنس</label>
                <Select
                  value={form.gender}
                  onValueChange={(v) => setForm({ ...form, gender: v as Gender })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">أنثى</SelectItem>
                    <SelectItem value="male">ذكر</SelectItem>
                  </SelectContent>
                </Select>
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

      {/* تسجيل في دورة */}
      <Dialog open={!!enrollDialogTrainee} onOpenChange={(o) => !o && setEnrollDialogTrainee(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>تسجيل {enrollDialogTrainee?.name} في دورة</DialogTitle>
          </DialogHeader>
          <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
            <SelectTrigger>
              <SelectValue placeholder="اختر الدورة" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.status !== "active" ? " (غير نشطة)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEnrollDialogTrainee(null)}>
              إلغاء
            </Button>
            <Button onClick={() => void enroll()} disabled={!selectedCourseId} className="gap-1">
              <Save className="h-4 w-4" /> تسجيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Trainees;
