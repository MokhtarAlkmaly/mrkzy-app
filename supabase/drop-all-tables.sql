-- حذف كل جداول المشروع وبياناتها من قاعدة البيانات (public schema)
-- شغّل هذا الملف في: Supabase Dashboard > SQL Editor > New query > Run
-- تحذير: هذا الحذف نهائي ولا يمكن التراجع عنه.
--
-- 17 جدولاً (مرتّبة بحيث تُحذف التابعة أولاً؛ CASCADE يغطي أي اعتماد متبقٍ).
-- المرجع الكامل: DATABASE.md

-- قسم التدريب والتأهيل
DROP TABLE IF EXISTS public.training_enrollments CASCADE;
DROP TABLE IF EXISTS public.trainees CASCADE;
DROP TABLE IF EXISTS public.training_courses CASCADE;

-- قسم القرآن الكريم (بيانات الطلاب التابعة أولاً)
DROP TABLE IF EXISTS public.year_data CASCADE;
DROP TABLE IF EXISTS public.hifz_history CASCADE;
DROP TABLE IF EXISTS public.monthly_tracking CASCADE;
DROP TABLE IF EXISTS public.students CASCADE;

-- المعلمون
DROP TABLE IF EXISTS public.teacher_bonuses CASCADE;
DROP TABLE IF EXISTS public.teachers CASCADE;

-- التكريم والمالية
DROP TABLE IF EXISTS public.awards CASCADE;
DROP TABLE IF EXISTS public.certificates CASCADE;
DROP TABLE IF EXISTS public.ceremony_expenses CASCADE;
DROP TABLE IF EXISTS public.donors CASCADE;

-- المسابقات وبنك الأسئلة
DROP TABLE IF EXISTS public.student_competitions CASCADE;
DROP TABLE IF EXISTS public.exam_questions CASCADE;

-- الوسائط والإعدادات
DROP TABLE IF EXISTS public.media CASCADE;
DROP TABLE IF EXISTS public.user_settings CASCADE;

-- في حال بقي أي جدول آخر في public، هذا السطر يحذف الباقي أيضاً:
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t.tablename);
  END LOOP;
END $$;

-- دالة تحديث updated_at (تُعاد إنشاؤها مع أول migration)
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- حذف ملفات الوسائط المخزّنة (اختياري)
-- DELETE FROM storage.objects WHERE bucket_id = 'media';
