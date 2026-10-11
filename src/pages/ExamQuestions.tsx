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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@/lib/router-compat";
import {
  ArrowRight,
  Plus,
  Pencil,
  Trash2,
  Save,
  BookOpenCheck,
  Printer,
  Layers,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { START_YEAR, END_YEAR } from "@/types/student";
import { getActiveYear, setActiveYear } from "@/utils/storage";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { printHtml, esc } from "@/utils/report";

type QuestionType = "mcq" | "true_false" | "written";

type QuestionRow = Database["public"]["Tables"]["exam_questions"]["Row"] & {
  choices: string[];
};

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "اختيار من متعدد",
  true_false: "صح / خطأ",
  written: "سؤال مقالي",
};

const DIFFICULTIES = ["سهل", "متوسط", "صعب"];

const emptyForm = () => ({
  category: "",
  subject: "",
  question_type: "mcq" as QuestionType,
  question: "",
  choicesText: "",
  correct_answer: "",
  difficulty: "متوسط",
  notes: "",
});

const ExamQuestions = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentYear, setCurrentYear] = useState("");
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(async () => {
    if (!currentYear || !user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("exam_questions")
      .select("*")
      .eq("user_id", user.id)
      .eq("year", currentYear)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "تعذّر تحميل الأسئلة", description: error.message, variant: "destructive" });
    } else {
      setRows(
        (data || []).map((r) => ({
          ...r,
          choices: Array.isArray(r.choices) ? (r.choices as string[]) : [],
        })),
      );
    }
    setLoading(false);
  }, [currentYear, user, toast]);

  useEffect(() => {
    void (async () => setCurrentYear(await getActiveYear()))();
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const subjects = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.subject).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "ar"),
      ),
    [rows],
  );

  // الفئات المدخلة في البيانات (فئة الحفظ) — كل فئة لها أسئلتها المختارة
  const categories = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => (r.category || "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "ar"),
      ),
    [rows],
  );

  const filteredRows = useMemo(
    () =>
      rows
        .filter((r) => (subjectFilter === "all" ? true : r.subject === subjectFilter))
        .filter((r) =>
          categoryFilter === "all" ? true : (r.category || "").trim() === categoryFilter,
        ),
    [rows, subjectFilter, categoryFilter],
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (r: QuestionRow) => {
    setEditingId(r.id);
    setForm({
      category: r.category || "",
      subject: r.subject,
      question_type: r.question_type as QuestionType,
      question: r.question,
      choicesText: (r.choices || []).join("، "),
      correct_answer: r.correct_answer || "",
      difficulty: r.difficulty,
      notes: r.notes || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.question.trim()) {
      toast({ title: "نص السؤال مطلوب", variant: "destructive" });
      return;
    }
    const choices =
      form.question_type === "mcq"
        ? form.choicesText
            .split(/[،,]/)
            .map((c) => c.trim())
            .filter(Boolean)
        : [];
    const payload = {
      user_id: user.id,
      year: currentYear,
      category: form.category.trim(),
      subject: form.subject.trim(),
      question_type: form.question_type,
      question: form.question.trim(),
      choices,
      correct_answer: form.correct_answer.trim() || null,
      difficulty: form.difficulty,
      notes: form.notes.trim() || null,
    };
    const { error } = editingId
      ? await supabase.from("exam_questions").update(payload).eq("id", editingId)
      : await supabase.from("exam_questions").insert(payload);
    if (error) {
      toast({ title: "تعذّر الحفظ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "تم التعديل" : "تمت الإضافة" });
    setDialogOpen(false);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذا السؤال؟")) return;
    const { error } = await supabase.from("exam_questions").delete().eq("id", id);
    if (error) {
      toast({ title: "تعذّر الحذف", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم الحذف", variant: "destructive" });
    await load();
  };

  const printQuestions = () => {
    const categoryLabel = categoryFilter !== "all" ? ` — فئة الحفظ: ${esc(categoryFilter)}` : "";
    const html = `
      <h2 style="text-align:center">بنك أسئلة الاختبارات — ${esc(currentYear)}هـ${categoryLabel}</h2>
      <ol style="font-size:14pt;line-height:2">
        ${filteredRows
          .map(
            (r) => `
          <li>
            <b>${esc(r.question)}</b>
            ${
              r.question_type === "mcq" && r.choices.length
                ? `<ul>${r.choices.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`
                : ""
            }
          </li>`,
          )
          .join("")}
      </ol>`;
    void printHtml(`أسئلة_${currentYear}`, html);
  };

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.45))]"
      dir="rtl"
    >
      <header className="mx-3 mt-3 rounded-[2rem] bg-gradient-to-br from-primary via-emerald-700 to-teal-950 px-4 py-5 text-primary-foreground shadow-2xl shadow-primary/20">
        <div className="container mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-4">
            <Link to="/students">
              <Button variant="ghost" size="sm" className="text-primary-foreground gap-1">
                <ArrowRight className="h-4 w-4" /> رجوع لصفحة الطلاب والطالبات
              </Button>
            </Link>
            <img src={logo} alt="الشعار" className="h-16 w-auto" />
            <div className="w-20" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
              <BookOpenCheck className="h-6 w-6" /> أسئلة الاختبارات
            </h1>
            <p className="text-sm opacity-90 mt-1">
              عام {currentYear}هـ — {filteredRows.length} سؤال
              {categoryFilter !== "all" ? ` (فئة: ${categoryFilter})` : ""}
            </p>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-7 space-y-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={currentYear}
              onValueChange={(v) => {
                setCurrentYear(v);
                void setActiveYear(v);
              }}
            >
              <SelectTrigger className="w-28">
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
            <div className="relative">
              <Layers className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48 pr-8">
                  <SelectValue placeholder="كل فئات الحفظ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل فئات الحفظ</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="كل المواد" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواد</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-1" onClick={printQuestions}>
              <Printer className="h-4 w-4" /> طباعة
            </Button>
            <Button className="gap-1" onClick={openAdd}>
              <Plus className="h-4 w-4" /> سؤال جديد
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {categoryFilter !== "all"
              ? `لا توجد أسئلة مسجلة لفئة "${categoryFilter}" بعد — أضف أسئلة وحدّد هذه الفئة لها`
              : "لا توجد أسئلة بعد"}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRows.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-white/70 bg-card/90 shadow-sm p-4"
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {(r.category || "").trim() && (
                    <Badge className="bg-primary/10 text-primary border-primary/20">
                      <Layers className="h-3 w-3 ml-1" />
                      {(r.category || "").trim()}
                    </Badge>
                  )}
                  {r.subject && <Badge variant="secondary">{r.subject}</Badge>}
                  <Badge variant="outline">
                    {TYPE_LABELS[r.question_type as QuestionType] || r.question_type}
                  </Badge>
                  <Badge variant="outline">{r.difficulty}</Badge>
                  <div className="flex-1" />
                  <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => void remove(r.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <p className="font-semibold">{r.question}</p>
                {r.question_type === "mcq" && r.choices.length > 0 && (
                  <ul className="mt-2 list-disc pr-5 text-sm text-muted-foreground">
                    {r.choices.map((c, i) => (
                      <li
                        key={i}
                        className={c === r.correct_answer ? "text-emerald-600 font-bold" : ""}
                      >
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
                {r.correct_answer && r.question_type !== "mcq" && (
                  <p className="mt-1 text-sm text-emerald-600 font-bold">
                    الإجابة: {r.correct_answer}
                  </p>
                )}
                {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل سؤال" : "إضافة سؤال"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">
                فئة الحفظ{" "}
                <span className="text-muted-foreground font-normal">
                  (كل فئة لها أسئلتها المختارة)
                </span>
              </label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="مثال: حفظ كامل المصحف، 5 أجزاء، جزء عمّ..."
                list="exam-category-suggestions"
              />
              <datalist id="exam-category-suggestions">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">المادة / الجزء</label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="مثال: جزء عمّ"
                />
              </div>
              <div>
                <label className="text-sm font-medium">نوع السؤال</label>
                <Select
                  value={form.question_type}
                  onValueChange={(v) => setForm({ ...form, question_type: v as QuestionType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">نص السؤال</label>
              <Textarea
                rows={2}
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
              />
            </div>
            {form.question_type === "mcq" && (
              <div>
                <label className="text-sm font-medium">الخيارات (افصل بينها بفاصلة ،)</label>
                <Textarea
                  rows={2}
                  value={form.choicesText}
                  onChange={(e) => setForm({ ...form, choicesText: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">الإجابة الصحيحة</label>
                <Input
                  value={form.correct_answer}
                  onChange={(e) => setForm({ ...form, correct_answer: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">مستوى الصعوبة</label>
                <Select
                  value={form.difficulty}
                  onValueChange={(v) => setForm({ ...form, difficulty: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
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
    </div>
  );
};

export default ExamQuestions;
