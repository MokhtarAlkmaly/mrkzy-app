import type { ComponentType, ReactNode } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";

import { LogoBadge } from "@/components/LogoBadge";
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

/**
 * الترويسة الموحّدة لكل صفحات النظام: اسم المركز كبيراً، ثم عنوان الصفحة،
 * ثم اليوم والتاريخ الهجري والميلادي بتوقيت اليمن (تُحدَّث تلقائياً).
 *
 * التصميم مضبوط لكل الشاشات: من جوال 320px إلى الشاشات العريضة —
 * بخطوط سائلة (clamp) وشبكة علوية تضمن بقاء الشعار في مكانه بالضبط
 * مهما كثرت أزرار الأعلى.
 */
const HEADER_STYLES: Record<"quran" | "training", { header: string; ink: string }> = {
  quran: {
    header:
      "relative isolate mx-2 mt-2 overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-primary via-emerald-700 to-teal-950 px-3 py-4 text-primary-foreground shadow-2xl shadow-primary/20 sm:mx-3 sm:mt-3 sm:rounded-[2rem] sm:px-5 sm:py-5 lg:px-7 lg:py-6",
    ink: "text-primary-foreground",
  },
  training: {
    header:
      "relative isolate mx-2 mt-2 overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-amber-600 via-orange-700 to-rose-900 px-3 py-4 text-white shadow-2xl shadow-amber-900/20 sm:mx-3 sm:mt-3 sm:rounded-[2rem] sm:px-5 sm:py-5 lg:px-7 lg:py-6",
    ink: "text-white",
  },
};

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
      {/* طبقات زخرفية خفيفة تعطي الترويسة عمقاً وإحساساً راقياً */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_16%_6%,rgba(255,255,255,.20),transparent_42%),radial-gradient(circle_at_84%_92%,rgba(255,255,255,.10),transparent_46%)] print:hidden"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] border border-white/12"
      />

      <div className="container mx-auto max-w-7xl">
        {/* الشبكة العلوية: [يمين] رجوع · [وسط] الشعار · [يسار] الأزرار
            الوسط ثابت (auto) فيبقى الشعار في منتصف الأعلى دائماً */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-3">
          <div className="flex min-w-0 items-center justify-start gap-1">
            {backTo ? (
              <Link to={backTo}>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={backLabel}
                  className={`${styles.ink} shrink-0 gap-1 px-2 sm:px-3`}
                >
                  <ArrowRight className="h-4 w-4" />
                  <span className="hidden text-xs font-bold sm:inline sm:text-sm">{backLabel}</span>
                </Button>
              </Link>
            ) : null}
          </div>

          {showLogo ? (
            <LogoBadge size="md" goldRing alt={CENTER_NAME} />
          ) : (
            <span aria-hidden className="block" />
          )}

          {/* الأزرار تتضغط تلقائياً على الجوال وتلتفّ بدل أن تزحمن الشعار */}
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 [&_button]:h-8 [&_button]:px-2 [&_button]:text-[11px] sm:gap-1.5 sm:[&_button]:px-3 sm:[&_button]:text-xs">
            {actions}
          </div>
        </div>

        {/* شعرة ذهبية رقيقة تفصل الأعلى عن اسم المركز */}
        <div
          aria-hidden
          className="mx-auto mt-3 h-px w-20 bg-gradient-to-l from-transparent via-islamic-gold/70 to-transparent sm:mt-4 sm:w-44"
        />

        <div className="text-center">
          <h1 className="mt-3 text-[clamp(1.35rem,5.2vw,2.5rem)] font-black leading-tight tracking-tight drop-shadow-sm sm:mt-4">
            {CENTER_NAME}
          </h1>

          <h2 className="mt-2 inline-flex max-w-full items-center justify-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[clamp(.9rem,2.6vw,1.2rem)] font-bold ring-1 ring-white/15">
            {Icon ? <Icon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" /> : null}
            <span className="text-balance">{title}</span>
          </h2>

          {subtitle ? (
            <div className="mx-auto mt-2 max-w-2xl text-[clamp(.72rem,2vw,.9rem)] opacity-90">
              {subtitle}
            </div>
          ) : null}

          {showDates ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[10px] font-medium sm:gap-2 sm:text-xs">
              {dates.dayName ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 ring-1 ring-white/15 sm:px-3">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {dates.dayName}
                </span>
              ) : null}
              {dates.hijriDate ? (
                <span className="rounded-full bg-white/12 px-2.5 py-1 ring-1 ring-white/15 sm:px-3">
                  {dates.hijriDate}
                </span>
              ) : null}
              {dates.gregorianDate ? (
                <span className="rounded-full bg-white/12 px-2.5 py-1 ring-1 ring-white/15 sm:px-3">
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
