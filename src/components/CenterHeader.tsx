import type { ComponentType, ReactNode } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";

import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { useArabicDates } from "@/hooks/useArabicDates";
import { Link } from "@/lib/router-compat";
import { CENTER_NAME } from "@/utils/centerInfo";

type IconType = ComponentType<{ className?: string }>;

export type CenterHeaderProps = {
  /** عنوان الصفحة، ويظهر تحت اسم المركز */
  title: string;
  /** أيقونة بجانب عنوان الصفحة */
  icon?: IconType;
  /** سطر توضيحي تحت العنوان (مثل عدد السجلات أو العام عند الصفحات السنوية) */
  subtitle?: ReactNode;
  /** رابط زر الرجوع (أعلى الترويسة) */
  backTo?: string;
  /** نص زر الرجوع — الافتراضي «رجوع» */
  backLabel?: string;
  /** أزرار أعلى الترويسة (تبديل القسم، خروج، ...) */
  actions?: ReactNode;
  /** محتوى إضافي أسفل التواريخ (بطاقات إحصائية، منتقي العام، ...) */
  children?: ReactNode;
  /** لون الترويسة: قسم القرآن الكريم (افتراضي) أو قسم التدريب */
  variant?: "quran" | "training";
  /** إظهار شعار المركز — يظهر افتراضياً */
  showLogo?: boolean;
  /** إظهار اليوم والتاريخين — يظهر افتراضياً */
  showDates?: boolean;
};

const HEADER_STYLES: Record<"quran" | "training", { header: string; ink: string }> = {
  quran: {
    header:
      "mx-3 mt-3 rounded-[2rem] bg-gradient-to-br from-primary via-emerald-700 to-teal-950 px-4 py-5 text-primary-foreground shadow-2xl shadow-primary/20",
    ink: "text-primary-foreground",
  },
  training: {
    header:
      "mx-3 mt-3 rounded-[2rem] bg-gradient-to-br from-amber-600 via-orange-700 to-rose-900 px-4 py-5 text-white shadow-2xl shadow-amber-900/20",
    ink: "text-white",
  },
};

/**
 * الترويسة الموحّدة لكل صفحات النظام: اسم المركز كبيراً، ثم عنوان الصفحة،
 * ثم اليوم والتاريخ الهجري والميلادي بتوقيت اليمن (تُحدَّث تلقائياً).
 */
export function CenterHeader({
  title,
  icon: Icon,
  subtitle,
  backTo,
  backLabel = "رجوع",
  actions,
  children,
  variant = "quran",
  showLogo = true,
  showDates = true,
}: CenterHeaderProps) {
  const dates = useArabicDates();
  const styles = HEADER_STYLES[variant];

  return (
    <header className={styles.header}>
      <div className="container mx-auto max-w-7xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            {backTo ? (
              <Link to={backTo}>
                <Button variant="ghost" size="sm" className={`${styles.ink} gap-1`}>
                  <ArrowRight className="h-4 w-4" /> {backLabel}
                </Button>
              </Link>
            ) : null}
          </div>

          {showLogo ? <img src={logo} alt={CENTER_NAME} className="h-14 w-auto sm:h-16" /> : null}

          <div className="flex items-center justify-end gap-1">{actions}</div>
        </div>

        <div className="text-center">
          <h1 className="mt-2 text-2xl font-black tracking-tight drop-shadow-sm sm:text-3xl">
            {CENTER_NAME}
          </h1>

          <h2 className="mt-2 flex items-center justify-center gap-2 text-base font-bold sm:text-lg">
            {Icon ? <Icon className="h-5 w-5" /> : null}
            <span>{title}</span>
          </h2>

          {subtitle ? <div className="mt-1 text-sm opacity-90">{subtitle}</div> : null}

          {showDates ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] font-medium sm:text-xs">
              {dates.dayName ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 ring-1 ring-white/15">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {dates.dayName}
                </span>
              ) : null}
              {dates.hijriDate ? (
                <span className="rounded-full bg-white/12 px-3 py-1 ring-1 ring-white/15">
                  {dates.hijriDate}
                </span>
              ) : null}
              {dates.gregorianDate ? (
                <span className="rounded-full bg-white/12 px-3 py-1 ring-1 ring-white/15">
                  {dates.gregorianDate}
                </span>
              ) : null}
            </div>
          ) : null}

          {children}
        </div>
      </div>
    </header>
  );
}

export default CenterHeader;
