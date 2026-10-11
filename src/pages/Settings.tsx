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
import { ArrowRight, Settings as SettingsIcon, Save } from "lucide-react";
import logo from "@/assets/logo.png";
import { START_YEAR, END_YEAR } from "@/types/student";
import { getActiveYear, setActiveYear } from "@/utils/storage";
import { supabase } from "@/integrations/supabase/client";

const Settings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeYear, setActiveYearState] = useState("");
  const [centerName, setCenterName] = useState("");
  const [teacherSignature, setTeacherSignature] = useState("");
  const [supervisorSignature, setSupervisorSignature] = useState("");
  const [managerSignature, setManagerSignature] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const year = await getActiveYear();
    setActiveYearState(year);
    const { data } = await supabase
      .from("user_settings")
      .select("center_name, teacher_signature, supervisor_signature, manager_signature")
      .eq("user_id", user.id)
      .maybeSingle();
    setCenterName(data?.center_name || "");
    setTeacherSignature(data?.teacher_signature || "");
    setSupervisorSignature(data?.supervisor_signature || "");
    setManagerSignature(data?.manager_signature || "");
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!user) return;
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
          <div className="space-y-5 rounded-[1.5rem] border border-white/70 bg-card/90 shadow-xl shadow-primary/5 p-5">
            <div>
              <label className="text-sm font-medium">سنة المسابقة النشطة</label>
              <Select value={activeYear} onValueChange={setActiveYearState}>
                <SelectTrigger className="w-40">
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

            <div>
              <label className="text-sm font-medium">
                اسم المركز/الجهة (يظهر في الشهادات والتقارير)
              </label>
              <Input
                value={centerName}
                onChange={(e) => setCenterName(e.target.value)}
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
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">اسم المشرفة</label>
                  <Input
                    value={supervisorSignature}
                    onChange={(e) => setSupervisorSignature(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">اسم المديرة</label>
                  <Input
                    value={managerSignature}
                    onChange={(e) => setManagerSignature(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Button onClick={() => void save()} disabled={saving} className="w-full gap-2">
              <Save className="h-4 w-4" /> {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
