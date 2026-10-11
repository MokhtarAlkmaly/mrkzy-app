-- حذف كل جداول المشروع وبياناتها من قاعدة البيانات (public schema)
-- شغّل هذا الملف في: Supabase Dashboard > SQL Editor > New query > Run
-- تحذير: هذا الحذف نهائي ولا يمكن التراجع عنه.
--
-- 22 جدولاً (مرتّبة بحيث تُحذف التابعة أولاً؛ CASCADE يغطي أي اعتماد متبقٍ).
-- المرجع الكامل: DATABASE.md

-- قسم التدريب والتأهيل
DROP TABLE IF EXISTS public.training_enrollments CASCADE;
DROP TABLE IF EXISTS public.trainees CASCADE;
DROP TABLE IF EXISTS public.training_courses CASCADE;

-- روابط المعلمين وترسيلاتهم (تعتمد على المعلمين والطلاب)
DROP TABLE IF EXISTS public.monthly_submissions CASCADE;
DROP TABLE IF EXISTS public.teacher_portals CASCADE;

-- المستخدمون والصلاحيات (تعتمد على auth.users)
DROP TABLE IF EXISTS public.data_access_grants CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

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

-- دوال نظام المستخدمين والصلاحيات
DROP FUNCTION IF EXISTS public.admin_list_users() CASCADE;
DROP FUNCTION IF EXISTS public.admin_set_role(uuid, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_read_user_data(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_email(text) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.admin_email() CASCADE;

-- دوال بوابة المعلم/ة (التواقيع كما في ترحيل 20261011140000)
DROP FUNCTION IF EXISTS public.open_teacher_portal(text) CASCADE;
DROP FUNCTION IF EXISTS public.submit_teacher_monthly(
  text, bigint, text, text, integer,
  integer, integer, integer, integer,
  numeric, numeric,
  integer, integer, integer, integer,
  numeric, numeric, numeric, numeric, text
) CASCADE;

-- تريغر إنشاء الملف الشخصي عند تسجيل حساب جديد
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- نوع الأدوار
DROP TYPE IF EXISTS public.app_role CASCADE;

-- دالة تحديث updated_at (تُعاد إنشاؤها مع أول migration)
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- حذف ملفات الوسائط المخزّنة (اختياري)
-- DELETE FROM storage.objects WHERE bucket_id = 'media';
