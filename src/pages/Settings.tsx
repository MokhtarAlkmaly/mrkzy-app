import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@/lib/router-compat";
import {
  ArrowRight,
  Settings as SettingsIcon,
  Save,
  Plus,
  Trash2,
  RotateCcw,
  Columns3,
  CheckCircle2,
  UserCog,
  Eye,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { CustomColumnDef, DEFAULT_STATUSES, START_YEAR, END_YEAR } from "@/types/student";
import {
  getActiveYear,
  setActiveYear,
  loadCustomColumns,
  saveCustomColumns,
  loadStudentStatuses,
  saveStudentStatuses,
} from "@/utils/storage";
import { getMyProfile, updateMyDisplayName } from "@/utils/users";
import { supabase } from "@/integrations/supabase/client";

const columnTypeLabels: Record<NonNullable<CustomColumnDef["type"]>, string> = {
  text: "نص",
  number: "رقم",
  date: "تاريخ",
  phone: "هاتف",
};

const newColumnId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const Settings = () => {
  const { user, viewAs, refreshAccess } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeYear, setActiveYearState] = useState("");
  const [centerName, setCenterName] = useState("");
  const [teacherSignature, setTeacherSignature] = useState("");
  const [supervisorSignature, setSupervisorSignature] = useState("");
  const [managerSignature, setManagerSignature] = useState("");

  // الملف الشخصي (الاسم الظاهر لبقية المستخدمين وفي قائمة «إدارة المستخدمين»)
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // حالات الطلاب والأعمدة المخصّصة في السجل
  const [statuses, setStatuses] = useState<string[]>(DEFAULT_STATUSES);
  const [newStatus, setNewStatus] = useState("");
  const [columns, setColumns] = useState<CustomColumnDef[]>([]);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<NonNullable<CustomColumnDef["type"]>>("text");

  // أثناء الاطلاع على بيانات مستخدم آخر كل التعديلات معطّلة (قراءة فقط).
  const readOnly = !!viewAs;

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const year = await getActiveYear();
    setActiveYearState(year);
    const [settings, loadedStatuses, loadedColumns, profile] = await Promise.all([
      supabase
        .from("user_settings")
        .select("center_name, teacher_signature, supervisor_signature, manager_signature, user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      loadStudentStatuses().catch(() => DEFAULT_STATUSES),
      loadCustomColumns().catch(() => [] as CustomColumnDef[]),
      getMyProfile().catch(() => null),
    ]);
    setCenterName(settings.data?.center_name || "");
    setTeacherSignature(settings.data?.teacher_signature || "");
    setSupervisorSignature(settings.data?.supervisor_signature || "");
    setManagerSignature(settings.data?.manager_signature || "");
    setStatuses(loadedStatuses);
    setColumns(loadedColumns);
    setDisplayName(profile?.display_name || "");
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!user || readOnly) return;
    setSaving(true);
    await setActiveYear(activeYear);
    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: user.id,
        center_name: centerName.trim(),
        teacher_signature: teacherSignature.trim(),
        supervisor_signature: supervisorSignature.trim(),
        manager_signature: managerSignature.trim(),
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) {
      toast({ title: "تعذّر حفظ الإعدادات", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم حفظ الإعدادات" });
  };

  const saveProfile = async () => {
    if (readOnly) return;
    const nextName = displayName.trim();
    if (!nextName) {
      toast({
        title: "الاسم فارغ",
        description: "اكتب اسماً ظاهراً قبل الحفظ",
        variant: "destructive",
      });
      return;
    }
    setSavingProfile(true);
    try {
      await updateMyDisplayName(nextName);
      await refreshAccess();
      toast({ title: "تم تحديث الاسم الظاهر" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "خطأ غير متوقع";
      toast({ title: "تعذّر تحديث الاسم", description: message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  // ===== حالات الطلاب =====
  const persistStatuses = async (next: string[], message = "تم حفظ الحالات") => {
    if (readOnly) return;
    setStatuses(next);
    try {
      await saveStudentStatuses(next);
      toast({ title: message });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "خطأ غير متوقع";
      toast({ title: "تعذّر حفظ الحالات", description: msg, variant: "destructive" });
    }
  };

  const addStatus = async () => {
    const value = newStatus.trim();
    if (!value || readOnly) return;
    if (statuses.some((s) => s === value)) {
      toast({ title: "مكررة", description: "هذه الحالة موجودة مسبقاً", variant: "destructive" });
      return;
    }
    setNewStatus("");
    await persistStatuses([...statuses, value]);
  };

  const deleteStatus = async (status: string) => {
    if (readOnly || statuses.length <= 1) return;
    await persistStatuses(
      statuses.filter((s) => s !== status),
      "تم حذف الحالة",
    );
  };

  const resetStatuses = async () => {
    if (readOnly) return;
    await persistStatuses(DEFAULT_STATUSES, "تمت استعادة الحالات الافتراضية");
  };

  // ===== الأعمدة المخصّصة =====
  const persistColumns = async (next: CustomColumnDef[], message = "تم حفظ الأعمدة المخصصة") => {
    if (readOnly) return;
    setColumns(next);
    try {
      await saveCustomColumns(next);
      toast({ title: message });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "خطأ غير متوقع";
      toast({ title: "تعذّر حفظ الأعمدة", description: msg, variant: "destructive" });
    }
  };

  const addColumn = async () => {
    const name = newColumnName.trim();
    if (!name || readOnly) return;
    if (columns.some((c) => c.name === name)) {
      toast({ title: "مكرر", description: "يوجد عمود بالاسم نفسه", variant: "destructive" });
      return;
    }
    setNewColumnName("");
    await persistColumns([...columns, { id: newColumnId(), name, type: newColumnType }]);
  };

  const deleteColumn = async (id: string) => {
    if (readOnly) return;
    await persistColumns(
      columns.filter((c) => c.id !== id),
      "تم حذف العمود",
    );
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
              <SettingsIcon className="h-6 w-6" /> الإعدادات
            </h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-2xl px-3 py-5 sm:px-4 sm:py-7">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
        ) : (
          <div className="space-y-5">
            {readOnly && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <Eye className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  أنت تطالع بيانات <strong>{viewAs?.name}</strong> الآن. إعدادات السجل الخاصة بصاحب
                  البيانات معروضة للقراءة فقط، والتعديل معطّل حتى تعود إلى بياناتك.
                </p>
              </div>
            )}

            <div className="space-y-5 rounded-[1.5rem] border border-white/70 bg-card/90 shadow-xl shadow-primary/5 p-5">
              <div>
                <label className="text-sm font-medium">سنة المسابقة النشطة</label>
                <Select value={activeYear} onValueChange={setActiveYearState}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(
                      { length: END_YEAR - START_YEAR + 1 },
                      (_, i) => START_YEAR + i,
                    ).map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}هـ
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">
                  اسم المركز/الجهة (يظهر في الشهادات والتقارير)
                </label>
                <Input
                  value={centerName}
                  onChange={(e) => setCenterName(e.target.value)}
                  disabled={readOnly}
                  placeholder="مركز إنماء الأهلي الخيري"
                />
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm font-semibold mb-3">التوقيعات الافتراضية عند الطباعة</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">اسم المعلم/المعلمة</label>
                    <Input
                      value={teacherSignature}
                      onChange={(e) => setTeacherSignature(e.target.value)}
                      disabled={readOnly}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">اسم المشرفة</label>
                    <Input
                      value={supervisorSignature}
                      onChange={(e) => setSupervisorSignature(e.target.value)}
                      disabled={readOnly}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">اسم المديرة</label>
                    <Input
                      value={managerSignature}
                      onChange={(e) => setManagerSignature(e.target.value)}
                      disabled={readOnly}
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={() => void save()}
                disabled={saving || readOnly}
                className="w-full gap-2"
              >
                <Save className="h-4 w-4" /> {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
              </Button>
            </div>

            {/* ===== الملف الشخصي ===== */}
            <div className="space-y-4 rounded-[1.5rem] border border-white/70 bg-card/90 p-5 shadow-xl shadow-primary/5">
              <div className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-base font-semibold">الملف الشخصي</p>
                  <p className="text-xs text-muted-foreground">
                    الاسم الظاهر في قائمة «إدارة المستخدمين» وعند اطلاع الآخرين على بياناتك.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveProfile();
                    }
                  }}
                  placeholder="مثال: أبو عبدالله"
                  disabled={readOnly}
                />
                <Button
                  onClick={() => void saveProfile()}
                  disabled={savingProfile || readOnly}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" /> {savingProfile ? "جارٍ الحفظ..." : "حفظ الاسم"}
                </Button>
              </div>
              {user?.email && (
                <p className="text-xs text-muted-foreground">
                  الحساب: <span dir="ltr">{user.email}</span>
                </p>
              )}
            </div>

            {/* ===== حالات الطلاب ===== */}
            <div className="space-y-4 rounded-[1.5rem] border border-white/70 bg-card/90 p-5 shadow-xl shadow-primary/5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-base font-semibold">حالات الطلاب والطالبات</p>
                  <p className="text-xs text-muted-foreground">
                    الحالات التي تظهر في خانة «الحالة» داخل ملف الطالب/ة.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addStatus();
                    }
                  }}
                  placeholder="مثال: مكفول، متفوق، منقطع"
                  disabled={readOnly}
                />
                <Button
                  onClick={() => void addStatus()}
                  disabled={readOnly || !newStatus.trim()}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> إضافة
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {statuses.map((status) => (
                  <span
                    key={status}
                    className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"
                  >
                    {status}
                    <button
                      type="button"
                      onClick={() => void deleteStatus(status)}
                      disabled={readOnly || statuses.length <= 1}
                      className="rounded-full p-0.5 text-primary/70 hover:bg-primary/15 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                      aria-label={`حذف ${status}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={() => void resetStatuses()}
                disabled={readOnly}
                className="w-full gap-2"
              >
                <RotateCcw className="h-4 w-4" /> استعادة الحالات الافتراضية
              </Button>
            </div>

            {/* ===== الأعمدة المخصّصة ===== */}
            <div className="space-y-4 rounded-[1.5rem] border border-white/70 bg-card/90 p-5 shadow-xl shadow-primary/5">
              <div className="flex items-center gap-2">
                <Columns3 className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-base font-semibold">الأعمدة المخصّصة</p>
                  <p className="text-xs text-muted-foreground">
                    أعمدة إضافية تظهر داخل سجل الطلاب وملف الطالب/ة (تُحفظ قيمها في custom_fields).
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
                <Input
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addColumn();
                    }
                  }}
                  placeholder="اسم العمود"
                  disabled={readOnly}
                />
                <Select
                  value={newColumnType}
                  onValueChange={(value) =>
                    setNewColumnType(value as NonNullable<CustomColumnDef["type"]>)
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(columnTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => void addColumn()}
                  disabled={readOnly || !newColumnName.trim()}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> إضافة
                </Button>
              </div>

              {columns.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/40 p-5 text-center text-sm text-muted-foreground">
                  لا توجد أعمدة مخصصة بعد.
                </div>
              ) : (
                <div className="space-y-2">
                  {columns.map((column) => (
                    <div
                      key={column.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-background/70 px-3 py-2"
                    >
                      <div>
                        <div className="font-semibold">{column.name}</div>
                        <div className="text-xs text-muted-foreground">
                          النوع: {columnTypeLabels[column.type || "text"]}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void deleteColumn(column.id)}
                        disabled={readOnly}
                        className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" /> حذف
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
