import { Link } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { BookOpenText, Scissors, Database, WifiOff } from "lucide-react";
import logo from "@/assets/logo.png";
import { useDbStatus } from "@/offline/useDbStatus";

const DepartmentSelect = () => {
  const dbStatus = useDbStatus();

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.5))] px-4 py-10"
      dir="rtl"
    >
      <div className="absolute top-4 left-4">
        <Link to="/database">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            <Database className="h-4 w-4" /> قاعدة البيانات
          </Button>
        </Link>
      </div>

      <img src={logo} alt="الشعار" className="h-24 w-auto mb-4" />
      <h1 className="text-2xl sm:text-3xl font-bold text-center">مركز إنماء الأهلي الخيري</h1>
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
        <WifiOff className="h-3.5 w-3.5" />
        يعمل بدون إنترنت · المجلد: <span dir="auto">{dbStatus.folderLabel}</span>
      </span>
      <p className="text-muted-foreground mt-3 mb-8 text-center">اختر القسم الذي تريد إدارته</p>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
        <Link to="/quran">
          <div className="h-full rounded-[2rem] bg-gradient-to-br from-primary via-emerald-700 to-teal-950 text-primary-foreground p-8 shadow-2xl shadow-primary/25 hover:-translate-y-1 hover:shadow-primary/40 transition-all text-center">
            <BookOpenText className="h-12 w-12 mx-auto mb-4 opacity-90" />
            <h2 className="text-xl font-bold">قسم القرآن الكريم</h2>
            <p className="text-sm opacity-85 mt-2">
              الطلاب والطالبات، المعلمين، المتابعة الشهرية، المسابقة الرمضانية، التكريم، والخاتمون
              والخاتمات
            </p>
          </div>
        </Link>

        <Link to="/training">
          <div className="h-full rounded-[2rem] bg-gradient-to-br from-amber-600 via-orange-700 to-rose-900 text-white p-8 shadow-2xl shadow-amber-900/25 hover:-translate-y-1 hover:shadow-amber-900/40 transition-all text-center">
            <Scissors className="h-12 w-12 mx-auto mb-4 opacity-90" />
            <h2 className="text-xl font-bold">التدريب والتأهيل</h2>
            <p className="text-sm opacity-85 mt-2">
              الدورات التعليمية والمهنية: خياطة، قيادة، نقش، روضة أطفال، والمتدربون والمتدربات
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default DepartmentSelect;
