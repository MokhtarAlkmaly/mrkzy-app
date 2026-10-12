import { Link } from "@/lib/router-compat";
import { useArabicDates } from "@/hooks/useArabicDates";
import { useSignOut } from "@/hooks/useSignOut";
import { Button } from "@/components/ui/button";
import { BookOpenText, CalendarDays, Scissors, LogOut } from "lucide-react";
import logo from "@/assets/logo.png";
import { CENTER_NAME, QURAN_DEPARTMENT_NAME, TRAINING_DEPARTMENT_NAME } from "@/utils/centerInfo";

const DepartmentSelect = () => {
  const signOut = useSignOut();
  const dates = useArabicDates();

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.5))] px-4 py-10"
      dir="rtl"
    >
      <div className="absolute top-4 left-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() => void signOut()}
        >
          <LogOut className="h-4 w-4" /> خروج
        </Button>
      </div>

      <img src={logo} alt={CENTER_NAME} className="h-24 w-auto mb-4" />
      <h1 className="text-2xl sm:text-3xl font-black text-center">{CENTER_NAME}</h1>
      <p className="text-muted-foreground mt-2 text-center">اختر القسم الذي تريد إدارته</p>

      <div className="mt-3 mb-8 flex flex-wrap items-center justify-center gap-2 text-xs font-medium">
        {dates.dayName ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-primary ring-1 ring-primary/15">
            <CalendarDays className="h-3.5 w-3.5" />
            {dates.dayName}
          </span>
        ) : null}
        {dates.hijriDate ? (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-primary ring-1 ring-primary/15">
            {dates.hijriDate}
          </span>
        ) : null}
        {dates.gregorianDate ? (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-primary ring-1 ring-primary/15">
            {dates.gregorianDate}
          </span>
        ) : null}
      </div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
        <Link to="/quran">
          <div className="h-full rounded-[2rem] bg-gradient-to-br from-primary via-emerald-700 to-teal-950 text-primary-foreground p-8 shadow-2xl shadow-primary/25 hover:-translate-y-1 hover:shadow-primary/40 transition-all text-center">
            <BookOpenText className="h-12 w-12 mx-auto mb-4 opacity-90" />
            <h2 className="text-xl font-bold">{QURAN_DEPARTMENT_NAME}</h2>
            <p className="text-sm opacity-85 mt-2">
              الطلاب والطالبات، المعلمين، المتابعة الشهرية، المسابقة الرمضانية، التكريم، والخاتمون
              والخاتمات
            </p>
          </div>
        </Link>

        <Link to="/training">
          <div className="h-full rounded-[2rem] bg-gradient-to-br from-amber-600 via-orange-700 to-rose-900 text-white p-8 shadow-2xl shadow-amber-900/25 hover:-translate-y-1 hover:shadow-amber-900/40 transition-all text-center">
            <Scissors className="h-12 w-12 mx-auto mb-4 opacity-90" />
            <h2 className="text-xl font-bold">{TRAINING_DEPARTMENT_NAME}</h2>
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
