-- ============================================================================
--  إثراء ملف الطالب/ة + الإعدادات المُدارة من الواجهة
--  ---------------------------------------------------------------------------
--  ما يفعله هذا الملف:
--   1) يضيف إلى جدول students حقول الملف التفصيلية التي تحتاجها شاشات السجل
--      وبطاقة الطالب/ة:
--        gender                 الجنس (ذكر/أنثى) — والمركز يسجّل البنين والبنات.
--        hijri_join_date        تاريخ الالتحاق الهجري.
--        initial_hifz           مقدار الحفظ قبل الالتحاق.
--        first_competition_year عام أول مسابقة شارك/ت فيها.
--        status                 الحالة (طبيعي/يتيم/مسكين/… أو حالة مخصصة).
--        school_grade           السنة الدراسية وقت الالتحاق.
--        guardian_phone         رقم ولي الأمر.
--        student_phone          رقم الطالب/ة.
--        custom_fields          قيم الأعمدة المخصّصة التي يضيفها المستخدم (jsonb).
--        notes                  ملاحظات.
--   2) يضيف إلى user_settings عمودين لحفظ تعريفات الأعمدة المخصّصة وقائمة
--      الحالات المخصّصة، فتصبح إعدادات يتحكم بها المستخدم من «الإعدادات».
--
--  كل الأعمدة اختيارية (nullable) بقيم افتراضية، فلا يتأثر أي صف موجود،
--  ولا تحتاج البيانات القديمة أي تحويل.
--
--  الملف آمن لإعادة التشغيل أكثر من مرة (idempotent).
-- ============================================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS hijri_join_date TEXT,
  ADD COLUMN IF NOT EXISTS initial_hifz TEXT,
  ADD COLUMN IF NOT EXISTS first_competition_year TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'طبيعي',
  ADD COLUMN IF NOT EXISTS school_grade TEXT,
  ADD COLUMN IF NOT EXISTS guardian_phone TEXT,
  ADD COLUMN IF NOT EXISTS student_phone TEXT,
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- فهرس لتصفية السجل حسب السنة الدراسية (قائمة «كل السنوات الدراسية»).
CREATE INDEX IF NOT EXISTS idx_students_school_grade
  ON public.students(user_id, school_grade);

-- فهرس لتصفية السجل حسب الجنس.
CREATE INDEX IF NOT EXISTS idx_students_gender
  ON public.students(user_id, gender);

-- إعدادات يتحكم بها المستخدم من واجهة «الإعدادات»:
--   student_custom_columns = تعريفات الأعمدة المخصّصة [{ id, name, type }]
--   student_statuses       = قائمة الحالات المتاحة ["طبيعي", "يتيم", …]
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS student_custom_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS student_statuses jsonb NOT NULL DEFAULT '[]'::jsonb;
