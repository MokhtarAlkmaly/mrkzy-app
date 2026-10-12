import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { CENTER_NAME } from "@/utils/centerInfo";

/**
 * إطار أبيض موحّد لشعار المركز (دائرة أو مربع بزوايا دائرية).
 *
 * الشعار يبقى في مكانه تماماً كما كان — الفرق أنّه صار داخل «قاعدة» بيضاء
 * راقية تبرز فوق الترويسة الملونة، وتتدرّج أحجامها تلقائياً مع كل الشاشات
 * (جوال 320px → شاشات عريضة) وتُطبع بلا ظل.
 */

/** أحجام جاهزة، كل حجم يتدرّج مع عرض الشاشة */
const SIZES = {
  /** القوائم الجانبية والمساحات الضيقة */
  xs: "h-8 w-8",
  /** ترويسات فرعية وبطاقات */
  sm: "h-10 w-10 sm:h-11 sm:w-11",
  /** الترويسة الموحّدة (الحجم الافتراضي) */
  md: "h-[4.25rem] w-[4.25rem] sm:h-20 sm:w-20",
  /** الصفحة الرئيسية */
  lg: "h-16 w-16 sm:h-20 sm:w-20",
  /** صفحات الدخول والاختيار */
  xl: "h-20 w-20 sm:h-24 sm:w-24",
} as const;

const SHAPES = {
  /** دائرة كاملة */
  circle: "rounded-full",
  /** مربع بزوايا دائرية (سكويركل) */
  squircle: "rounded-[26%]",
} as const;

export type LogoBadgeProps = {
  /** شكل الإطار: دائرة أو مربع بزوايا دائرية (الافتراضي) */
  shape?: keyof typeof SHAPES;
  /** حجم الإطار — يتدرّج تلقائياً مع الشاشة */
  size?: keyof typeof SIZES;
  /** إطار ذهبي رفيع حول القاعدة البيضاء */
  goldRing?: boolean;
  /** ظل أعمق (للترويسات الكبيرة) */
  elevated?: boolean;
  className?: string;
  imgClassName?: string;
  alt?: string;
};

export function LogoBadge({
  shape = "squircle",
  size = "md",
  goldRing = false,
  elevated = true,
  className,
  imgClassName,
  alt = CENTER_NAME,
}: LogoBadgeProps) {
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden bg-white p-[9%]",
        elevated ? "shadow-[0_18px_38px_-16px_rgba(0,0,0,0.55)]" : "shadow-md shadow-black/10",
        "ring-1 ring-white/60 print:shadow-none print:ring-0",
        goldRing && "ring-2 ring-islamic-gold/45",
        SIZES[size],
        SHAPES[shape],
        className,
      )}
    >
      {/* لمعة علوية خفيفة تعطي الإطار إحساساً زجاجياً راقياً */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/0 via-transparent to-black/[0.07] print:hidden"
      />
      <img
        src={logo}
        alt={alt}
        className={cn("relative h-full w-full object-contain", imgClassName)}
      />
    </div>
  );
}

export default LogoBadge;
