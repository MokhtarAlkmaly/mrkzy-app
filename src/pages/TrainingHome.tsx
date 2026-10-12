import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSignOut } from "@/hooks/useSignOut";
import { Link } from "@/lib/router-compat";
import { Users, BookMarked, ArrowLeftRight, LogOut } from "lucide-react";
import { CenterHeader } from "@/components/CenterHeader";
import { supabase } from "@/integrations/supabase/client";

const TrainingHome = () => {
  const { user } = useAuth();
  const signOut = useSignOut();
  const [traineesCount, setTraineesCount] = useState<number | null>(null);
  const [activeCoursesCount, setActiveCoursesCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [t, c] = await Promise.all([
      supabase.from("trainees").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase
        .from("training_courses")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active"),
    ]);
    setTraineesCount(t.count ?? 0);
    setActiveCoursesCount(c.count ?? 0);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = [
    {
      to: "/trainees",
      label: "المتدربون والمتدربات",
      desc: "السجل الرسمي: إضافة، تعديل، حذف، تسجيل في دورة",
      icon: Users,
      color: "from-amber-600 to-orange-700",
    },
    {
      to: "/courses",
      label: "الدورات",
      desc: "خياطة، قيادة، نقش، روضة أطفال، وغيرها",
      icon: BookMarked,
      color: "from-rose-600 to-pink-800",
    },
  ];

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(24_90%_55%/0.16),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.45))]"
      dir="rtl"
    >
      <CenterHeader
        variant="training"
        title="التدريب والتأهيل"
        subtitle="الدورات التعليمية والمهنية والمتدربون"
        actions={
          <>
            <Link to="/">
              <Button variant="ghost" size="sm" className="text-white gap-1">
                <ArrowLeftRight className="h-4 w-4" /> تبديل القسم
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="text-white gap-1"
              onClick={() => void signOut()}
            >
              <LogOut className="h-4 w-4" /> خروج
            </Button>
          </>
        }
      >
        <div className="mt-4 flex justify-center gap-6 text-sm">
          <div className="text-center">
            <div className="text-xl font-bold">{traineesCount ?? "—"}</div>
            <div className="opacity-80">متدرب/ة</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">{activeCoursesCount ?? "—"}</div>
            <div className="opacity-80">دورة نشطة</div>
          </div>
        </div>
      </CenterHeader>

      <div className="container mx-auto max-w-7xl px-3 py-6 sm:px-4 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sections.map((s) => (
            <Link key={s.to} to={s.to}>
              <div
                className={`h-full rounded-2xl bg-gradient-to-br ${s.color} text-white p-6 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all`}
              >
                <s.icon className="h-8 w-8 mb-3 opacity-90" />
                <div className="font-bold text-lg">{s.label}</div>
                <div className="text-sm opacity-85 mt-1 leading-relaxed">{s.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrainingHome;
