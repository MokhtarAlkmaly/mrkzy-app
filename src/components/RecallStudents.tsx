import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { History, Loader2, Users } from "lucide-react";
import {
  listRecallCandidates,
  recallStudentsToYear,
  ReadOnlyViewError,
  type RecallCandidate,
} from "@/utils/storage";
import { formatYearKey, formatYearKeyShort } from "@/types/student";
import { useToast } from "@/hooks/use-toast";

interface Props {
  /** مفتاح العام المستهدف: "1447" لمسابقة رمضان أو "1447D" لمسابقة عشر ذي الحجة. */
  targetYear: string;
  onRecalled: () => void | Promise<void>;
  /** شكل الزر (حجم/تنسيق) حسب الصفحة المستضيفة. */
  buttonClassName?: string;
  buttonVariant?: "secondary" | "outline" | "default" | "ghost";
}

/**
 * زر وحوار «استدعاء من السجل الشامل»: يسجّل طلاباً وطالبات من السجل (كل
 * الأعوام) في العام المختار مع ترحيل حفظهم التراكمي كـ«حفظ سابق».
 * متاح في كل صفحات الأعوام (المسابقة، المتابعة الشهرية، الجوائز، الشهادات،
 * المعلمون) حتى لا يضطر المستخدم للتنقل لصفحة أخرى عند بدء عام جديد.
 */
export const RecallStudents = ({
  targetYear,
  onRecalled,
  buttonClassName = "h-12 gap-2 rounded-2xl",
  buttonVariant = "secondary",
}: Props) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<RecallCandidate[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || !targetYear) return;
    setLoading(true);
    setSelected([]);
    setQuery("");
    listRecallCandidates(targetYear)
      .then(setCandidates)
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, [open, targetYear]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return candidates;
    return candidates.filter((c) => (c.name || "").includes(q) || (c.teacher || "").includes(q));
  }, [candidates, query]);

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    const ids = filtered.map((c) => c.id);
    const allSelected = ids.every((id) => selected.includes(id));
    setSelected(
      allSelected
        ? selected.filter((id) => !ids.includes(id))
        : Array.from(new Set([...selected, ...ids])),
    );
  };

  const handleRecall = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      const added = await recallStudentsToYear(targetYear, selected);
      toast({
        title: "تم الاستدعاء",
        description: `تم استدعاء ${added} طالب/طالبة من السجل الشامل إلى ${formatYearKey(
          targetYear,
        )} مع ترحيل الحفظ السابق`,
      });
      setOpen(false);
      await onRecalled();
    } catch (e) {
      toast({
        title: "خطأ",
        description: e instanceof ReadOnlyViewError ? e.message : "تعذّر استدعاء الطلاب والطالبات",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant} className={buttonClassName} disabled={!targetYear}>
          <History className="h-4 w-4" />
          استدعاء من السجل الشامل
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>استدعاء طلاب وطالبات إلى {formatYearKey(targetYear)}</DialogTitle>
          <DialogDescription>
            اختر الطلاب والطالبات من السجل الشامل (كل الأعوام)، وسيتم تسجيلهم في العام المختار مع
            نقل الإجمالي التراكمي كـ«حفظ سابق».
          </DialogDescription>
        </DialogHeader>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث بالاسم أو المعلم/المعلمة..."
          className="h-10 rounded-xl"
        />

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل...
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {query.trim()
              ? "لا توجد نتائج مطابقة للبحث"
              : "لا يوجد طلاب وطالبات غير مسجّلين في هذا العام — كل طلاب السجل الشامل موجودون بالفعل"}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={toggleAll}
                className="font-semibold text-primary hover:underline"
              >
                تحديد / إلغاء الكل ({filtered.length})
              </button>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> محدد: {selected.length}
              </span>
            </div>
            <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-xl border border-border/60 p-2">
              {filtered.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-lg p-2 text-sm hover:bg-secondary/50"
                >
                  <Checkbox
                    checked={selected.includes(c.id)}
                    onCheckedChange={() => toggle(c.id)}
                  />
                  <span className="min-w-0 flex-1 font-semibold">{c.name || "بدون اسم"}</span>
                  <span className="text-xs text-muted-foreground">{c.teacher || "—"}</span>
                  {/* الأعوام المسجَّل بها (ذو الحجة بلون مميز)، أو «جديد بالسجل» */}
                  <span className="flex max-w-[180px] flex-wrap items-center justify-end gap-1">
                    {c.years.length > 0 ? (
                      c.years.map((y) => (
                        <span
                          key={y}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            y.endsWith("D")
                              ? "bg-teal-500/15 text-teal-700 dark:text-teal-300"
                              : "bg-secondary"
                          }`}
                          title={formatYearKey(y)}
                        >
                          {formatYearKeyShort(y)}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        جديد بالسجل
                      </span>
                    )}
                  </span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                    حفظ سابق: {c.baseHifz}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            onClick={handleRecall}
            disabled={selected.length === 0 || saving}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <History className="h-4 w-4" />
            )}
            استدعاء المحدد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
