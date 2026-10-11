-- ============================================================================
--  توسيع المتابعة الشهرية إلى 12 شهراً (محرم — ذو الحجة)
--  ---------------------------------------------------------------------------
--  المتابعة الشهرية كانت محصورة بتسعة أشهر (محرم — رمضان) لأن المسابقة
--  الرمضانية تنتهي هناك. بقية أقسام المركز (و«بوابة المعلم/ة» المنقولة)
--  تحتاج السنة الهجرية كاملة.
--
--  ما يفعله هذا الملف:
--   1) يوسّع قيد الشهر من (1 — 9) إلى (1 — 12). لا يحذف ولا يعدّل أي بيانات
--      موجودة؛ كل الصفوف الحالية ضمن 1 — 9 فتبقى صالحة.
--   2) يضيف فهارس تُسرّع جلب المتابعة حسب المستخدم/العام/الشهر وحسب الطالب.
--
--  الملف آمن لإعادة التشغيل أكثر من مرة (idempotent).
-- ============================================================================

-- اسم القيد المولَّد تلقائياً عند إنشاء العمود بصيغة CHECK داخل تعريف الجدول.
ALTER TABLE public.monthly_tracking
  DROP CONSTRAINT IF EXISTS monthly_tracking_month_check;

ALTER TABLE public.monthly_tracking
  ADD CONSTRAINT monthly_tracking_month_check CHECK (month BETWEEN 1 AND 12);

CREATE INDEX IF NOT EXISTS idx_monthly_tracking_user_year_month
  ON public.monthly_tracking(user_id, year, month);

CREATE INDEX IF NOT EXISTS idx_monthly_tracking_student
  ON public.monthly_tracking(student_id);
