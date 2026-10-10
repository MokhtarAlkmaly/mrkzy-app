import { Link } from "@/lib/router-compat";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { BookOpenText, Scissors, LogOut } from "lucide-react";
import logo from "@/assets/logo.png";

const DepartmentSelect = () => {
  const { signOut } = useAuth();

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.5))] px-4 py-10"
      dir="rtl"
    >
      <div className="absolute top-4 left-4">
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" /> خروج
        </Button>
      </div>

      <img src={logo} alt="الشعار" className="h-24 w-auto mb-4" />
      <h1 className="text-2xl sm:text-3xl font-bold text-center">مركز إنماء الأهلي الخيري</h1>
      <p className="text-muted-foreground mt-2 mb-8 text-center">اختر القسم الذي تريد إدارته</p>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
        <Link to="/quran">
          <div className="h-full rounded-[2rem] bg-gradient-to-br from-primary via-emerald-700 to-teal-950 text-primary-foreground p-8 shadow-2xl shadow-primary/25 hover:-translate-y-1 hover:shadow-primary/40 transition-all text-center">
            <BookOpenText className="h-12 w-12 mx-auto mb-4 opacity-90" />
            <h2 className="text-xl font-bold">قسم القرآن الكريم</h2>
            <p className="text-sm opacity-85 mt-2">
              الطلاب والطالبات، المعلمين، المتابعة الشهرية، المسابقة الرمضانية، التكريم، والخاتمات
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
