import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@/lib/router-compat";
import {
  ArrowRight,
  LayoutDashboard,
  Users,
  GraduationCap,
  Award,
  HeartHandshake,
  Receipt,
  ScrollText,
  Sparkles,
  Home as HomeIcon,
  Globe2,
  BookOpenCheck,
  Settings as SettingsIcon,
  Camera,
  FileText,
  Database,
} from "lucide-react";
import logo from "@/assets/logo.png";
import {
  getActiveYear,
  loadGlobalStudents,
  loadTeachers,
  loadAwards,
  loadCertificates,
  loadDonors,
  loadCeremonyExpenses,
} from "@/utils/storage";
import { supabase } from "@/integrations/supabase/client";

interface Counts {
  students: number;
  teachers: number;
  awards: number;
  certificates: number;
  donors: number;
  expenses: number;
  internalCompetitions: number;
  externalCompetitions: number;
  examQuestions: number;
}

const emptyCounts: Counts = {
  students: 0,
  teachers: 0,
  awards: 0,
  certificates: 0,
  donors: 0,
  expenses: 0,
  internalCompetitions: 0,
  externalCompetitions: 0,
  examQuestions: 0,
};

const Management = () => {
  const { user } = useAuth();
  const [year, setYear] = useState("");
  const [counts, setCounts] = useState<Counts>(emptyCounts);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const y = await getActiveYear();
    setYear(y);
    const [
      students,
      teachers,
      awards,
      certificates,
      donors,
      expenses,
      internalC,
      externalC,
      questions,
    ] = await Promise.all([
      loadGlobalStudents(),
      loadTeachers(y),
      loadAwards(y),
      loadCertificates(y),
      loadDonors(y),
      loadCeremonyExpenses(y),
      supabase
        .from("student_competitions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("year", y)
        .eq("competition_type", "internal"),
      supabase
        .from("student_competitions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("year", y)
        .eq("competition_type", "external"),
      supabase
        .from("exam_questions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("year", y),
    ]);
    setCounts({
      students: students.length,
      teachers: teachers.length,
      awards: awards.length,
      certificates: certificates.length,
      donors: donors.length,
      expenses: expenses.length,
      internalCompetitions: internalC.count || 0,
      externalCompetitions: externalC.count || 0,
      examQuestions: questions.count || 0,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = [
    {
      to: "/students",
      label: "الطلاب والطالبات",
      icon: GraduationCap,
      value: counts.students,
      color: "bg-primary",
    },
    {
      to: "/teachers",
      label: "المعلمون والمعلمات",
      icon: Users,
      value: counts.teachers,
      color: "bg-emerald-600",
    },
    {
      to: "/awards",
      label: "التكريم والجوائز",
      icon: Award,
      value: counts.awards,
      color: "bg-amber-500",
    },
    {
      to: "/certificates",
      label: "الشهادات",
      icon: ScrollText,
      value: counts.certificates,
      color: "bg-teal-600",
    },
    {
      to: "/donors",
      label: "الداعمون",
      icon: HeartHandshake,
      value: counts.donors,
      color: "bg-rose-500",
    },
    {
      to: "/expenses",
      label: "المصروفات",
      icon: Receipt,
      value: counts.expenses,
      color: "bg-slate-600",
    },
    {
      to: "/internal-competition",
      label: "المسابقة الداخلية",
      icon: HomeIcon,
      value: counts.internalCompetitions,
      color: "bg-sky-600",
    },
    {
      to: "/external-competition",
      label: "المسابقة الخارجية",
      icon: Globe2,
      value: counts.externalCompetitions,
      color: "bg-indigo-600",
    },
    {
      to: "/exam-questions",
      label: "أسئلة الاختبارات",
      icon: BookOpenCheck,
      value: counts.examQuestions,
      color: "bg-fuchsia-600",
    },
  ];

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
              <LayoutDashboard className="h-6 w-6" /> الإدارة العامة
            </h1>
            <p className="text-sm opacity-90 mt-1">نظرة شاملة على بيانات عام {year}هـ</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-7 space-y-5">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {sections.map((s) => (
              <Link key={s.to} to={s.to}>
                <div className="h-full rounded-2xl border border-white/70 bg-card/90 p-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all">
                  <div
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${s.color} text-white mb-2`}
                  >
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-sm text-muted-foreground">{s.label}</div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="rounded-[1.5rem] border border-white/70 bg-card/90 shadow-xl shadow-primary/5 p-4">
          <p className="text-sm font-semibold mb-3">وصول سريع</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/ramadan-competition">
              <Button variant="outline" className="gap-1">
                <HomeIcon className="h-4 w-4" /> المسابقة الرمضانية
              </Button>
            </Link>
            <Link to="/quran">
              <Button variant="outline" className="gap-1">
                <LayoutDashboard className="h-4 w-4" /> الرئيسية
              </Button>
            </Link>
            <Link to="/monthly">
              <Button variant="outline" className="gap-1">
                <Sparkles className="h-4 w-4" /> المتابعة الشهرية
              </Button>
            </Link>
            <Link to="/khatimat">
              <Button variant="outline" className="gap-1">
                <Sparkles className="h-4 w-4" /> الخاتمون والخاتمات
              </Button>
            </Link>
            <Link to="/reports">
              <Button variant="outline" className="gap-1">
                <FileText className="h-4 w-4" /> التقارير
              </Button>
            </Link>
            <Link to="/media">
              <Button variant="outline" className="gap-1">
                <Camera className="h-4 w-4" /> الوسائط
              </Button>
            </Link>
            <Link to="/settings">
              <Button variant="outline" className="gap-1">
                <SettingsIcon className="h-4 w-4" /> الإعدادات
              </Button>
            </Link>
            <Link to="/database">
              <Button variant="outline" className="gap-1">
                <Database className="h-4 w-4" /> قاعدة البيانات والنسخ الاحتياطي
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Management;
