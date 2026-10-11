-- المتابعة الشهرية (محرم — رمضان):
-- كان هذا الجدول أُنشئ يدويًا في قاعدة بيانات الإنتاج خارج نظام الـ migrations،
-- فيُثبَّت هنا الآن حتى يصبح المخطط قابلاً لإعادة الإنشاء من الصفر بشكل موثوق.
--
-- IF NOT EXISTS + فحص وجود السياسات/المحفّزات يجعل الـ migration "قائماً بذاته"
-- (idempotent): تطبيقه على قاعدة البيانات الحالية لا يغيّر شيئًا، وعلى قاعدة
-- بيانات جديدة ينشئ الجدول كاملاً بنفس بنية الاستخدام في src/utils/storage.ts.
CREATE TABLE IF NOT EXISTS public.monthly_tracking (
  user_id uuid NOT NULL,
  student_id integer NOT NULL,
  year text NOT NULL,
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 9),
  memorization_from_surah integer,
  memorization_from_ayah integer,
  memorization_to_surah integer,
  memorization_to_ayah integer,
  memorization_hifz_score numeric NOT NULL DEFAULT 0,
  memorization_recitation_score numeric NOT NULL DEFAULT 0,
  review_from_surah integer,
  review_from_ayah integer,
  review_to_surah integer,
  review_to_ayah integer,
  review_hifz_score numeric NOT NULL DEFAULT 0,
  review_recitation_score numeric NOT NULL DEFAULT 0,
  attendance_score numeric NOT NULL DEFAULT 0,
  behavior_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_tracking TO authenticated;
GRANT ALL ON public.monthly_tracking TO service_role;
ALTER TABLE public.monthly_tracking ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'monthly_tracking' AND policyname = 'Users can view their own monthly_tracking') THEN
    CREATE POLICY "Users can view their own monthly_tracking" ON public.monthly_tracking FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'monthly_tracking' AND policyname = 'Users can create their own monthly_tracking') THEN
    CREATE POLICY "Users can create their own monthly_tracking" ON public.monthly_tracking FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'monthly_tracking' AND policyname = 'Users can update their own monthly_tracking') THEN
    CREATE POLICY "Users can update their own monthly_tracking" ON public.monthly_tracking FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'monthly_tracking' AND policyname = 'Users can delete their own monthly_tracking') THEN
    CREATE POLICY "Users can delete their own monthly_tracking" ON public.monthly_tracking FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_monthly_tracking_updated_at' AND tgrelid = 'public.monthly_tracking'::regclass) THEN
    CREATE TRIGGER update_monthly_tracking_updated_at BEFORE UPDATE ON public.monthly_tracking FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
