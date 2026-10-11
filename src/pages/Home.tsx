import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@/lib/router-compat";
import {
  GraduationCap,
  Users,
  Sparkles,
  Trophy,
  Home as HomeIcon,
  Globe2,
  Award,
  ScrollText,
  HeartHandshake,
  Receipt,
  Camera,
  BookOpenCheck,
  LayoutDashboard,
  Settings as SettingsIcon,
  LogOut,
  FileText,
  ArrowLeftRight,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { getActiveYear, loadGlobalStudents, loadTeachers } from "@/utils/storage";

const Home = () => {
  const { signOut } = useAuth();
  const [year, setYear] = useState("");
  const [studentsCount, setStudentsCount] = useState<number | null>(null);
  const [teachersCount, setTeachersCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    const y = await getActiveYear();
    setYear(y);
    const [students, teachers] = await Promise.all([loadGlobalStudents(), loadTeachers(y)]);
    setStudentsCount(students.length);
    setTeachersCount(teachers.length);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = [
    {
      to: "/students",
      label: "الطلاب والطالبات",
      desc: "السجل الرسمي: إضافة، تعديل، حذف",
      icon: GraduationCap,
      color: "from-primary to-emerald-700",
    },
    {
      to: "/teachers",
      label: "المعلمين",
      desc: "بيانات المعلمين والمعلمات ومكافآتهم",
      icon: Users,
      color: "from-emerald-600 to-teal-700",
    },
    {
      to: "/monthly",
      label: "المتابعة الشهرية",
      desc: "متابعة الحفظ والمراجعة شهريًا",
      icon: Sparkles,
      color: "from-amber-500 to-orange-600",
    },
    {
      to: "/ramadan-competition",
      label: "المسابقة الرمضانية",
      desc: "كشف المسابقة السنوية للحفظ",
      icon: Trophy,
      color: "from-teal-600 to-cyan-700",
    },
    {
      to: "/internal-competition",
      label: "المسابقة الداخلية",
      desc: "نتائج المسابقات داخل المركز",
      icon: HomeIcon,
      color: "from-sky-600 to-blue-700",
    },
    {
      to: "/external-competition",
      label: "المسابقة الخارجية",
      desc: "نتائج المسابقات الخارجية",
      icon: Globe2,
      color: "from-indigo-600 to-violet-700",
    },
    {
      to: "/awards",
      label: "التكريم والجوائز",
      desc: "طلاب وطالبات، معلمون ومعلمات، أولياء أمور",
      icon: Award,
      color: "from-amber-600 to-yellow-700",
    },
    {
      to: "/khatimat",
      label: "الخاتمون والخاتمات",
      desc: "كشف ختمات القرآن الكريم",
      icon: Sparkles,
      color: "from-emerald-700 to-green-800",
    },
    {
      to: "/certificates",
      label: "الشهادات",
      desc: "إصدار وطباعة الشهادات",
      icon: ScrollText,
      color: "from-cyan-600 to-sky-700",
    },
    {
      to: "/reports",
      label: "التقارير",
      desc: "تقرير شامل مطبوع لكل طالب/طالبة",
      icon: FileText,
      color: "from-blue-600 to-indigo-800",
    },
    {
      to: "/donors",
      label: "الداعمون",
      desc: "سجل الداعمين والتبرعات",
      icon: HeartHandshake,
      color: "from-rose-500 to-pink-700",
    },
    {
      to: "/expenses",
      label: "المصروفات",
      desc: "مصروفات الحفلات والفعاليات",
      icon: Receipt,
      color: "from-slate-600 to-slate-800",
    },
    {
      to: "/media",
      label: "الوسائط",
      desc: "صور وفعاليات المركز",
      icon: Camera,
      color: "from-purple-600 to-fuchsia-700",
    },
    {
      to: "/exam-questions",
      label: "أسئلة الاختبارات",
      desc: "توليد نماذج الاختبار من المصحف وبنك الأسئلة",
      icon: BookOpenCheck,
      color: "from-fuchsia-600 to-pink-700",
    },
  ];

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.45))]"
      dir="rtl"
    >
      <header className="mx-3 mt-3 rounded-[2rem] bg-gradient-to-br from-primary via-emerald-700 to-teal-950 px-4 py-6 text-primary-foreground shadow-2xl shadow-primary/20">
        <div className="container mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-3">
            <img src={logo} alt="الشعار" className="h-16 w-auto" />
            <div className="flex items-center gap-1">
              <Link to="/">
                <Button variant="ghost" size="sm" className="text-primary-foreground gap-1">
                  <ArrowLeftRight className="h-4 w-4" /> تبديل القسم
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary-foreground gap-1"
                onClick={() => void signOut()}
              >
                <LogOut className="h-4 w-4" /> خروج
              </Button>
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs opacity-80">مركز إنماء الأهلي الخيري</p>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1">قسم القرآن الكريم</h1>
            <p className="text-sm opacity-90 mt-2">نظام إدارة الطلاب والطالبات — عام {year}هـ</p>
          </div>
          {(studentsCount !== null || teachersCount !== null) && (
            <div className="mt-4 flex justify-center gap-6 text-sm">
              <div className="text-center">
                <div className="text-xl font-bold">{studentsCount ?? "—"}</div>
                <div className="opacity-80">طالب/طالبة</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold">{teachersCount ?? "—"}</div>
                <div className="opacity-80">معلم/معلمة</div>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-3 py-6 sm:px-4 space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sections.map((s) => (
            <Link key={s.to} to={s.to}>
              <div
                className={`h-full rounded-2xl bg-gradient-to-br ${s.color} text-white p-4 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all`}
              >
                <s.icon className="h-6 w-6 mb-2 opacity-90" />
                <div className="font-bold">{s.label}</div>
                <div className="text-xs opacity-85 mt-1 leading-relaxed">{s.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="rounded-[1.5rem] border border-white/70 bg-card/90 shadow-xl shadow-primary/5 p-4">
          <p className="text-sm font-semibold mb-3">الإدارة والإعدادات</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/management">
              <Button variant="outline" className="gap-1">
                <LayoutDashboard className="h-4 w-4" /> لوحة الإدارة والإحصائيات
              </Button>
            </Link>
            <Link to="/settings">
              <Button variant="outline" className="gap-1">
                <SettingsIcon className="h-4 w-4" /> الإعدادات
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
