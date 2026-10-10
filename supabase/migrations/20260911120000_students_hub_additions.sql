-- ==========================================================================
-- إضافات "صفحة الطالبات" المركزية: مسابقات داخلية/خارجية، بنك أسئلة الاختبارات،
-- وحقول إعدادات إضافية (اسم المركز والتوقيعات الافتراضية).
-- ==========================================================================

-- مسابقات داخلية وخارجية (منفصلة عن المسابقة السنوية الرئيسية)
CREATE TABLE public.student_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  year text NOT NULL,
  competition_type text NOT NULL DEFAULT 'internal' CHECK (competition_type IN ('internal', 'external')),
  student_name text NOT NULL,
  title text NOT NULL DEFAULT '',
  organizer text,
  rank text NOT NULL DEFAULT '',
  score text NOT NULL DEFAULT '',
  held_at date NOT NULL DEFAULT (now())::date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_competitions TO authenticated;
GRANT ALL ON public.student_competitions TO service_role;
ALTER TABLE public.student_competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own student_competitions" ON public.student_competitions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own student_competitions" ON public.student_competitions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own student_competitions" ON public.student_competitions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own student_competitions" ON public.student_competitions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_student_competitions_updated_at BEFORE UPDATE ON public.student_competitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- بنك أسئلة الاختبارات
CREATE TABLE public.exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  year text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  question_type text NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'true_false', 'written')),
  question text NOT NULL DEFAULT '',
  choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_answer text,
  difficulty text NOT NULL DEFAULT 'متوسط',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_questions TO authenticated;
GRANT ALL ON public.exam_questions TO service_role;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own exam_questions" ON public.exam_questions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own exam_questions" ON public.exam_questions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own exam_questions" ON public.exam_questions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own exam_questions" ON public.exam_questions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_exam_questions_updated_at BEFORE UPDATE ON public.exam_questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- حقول إعدادات إضافية عامة للتطبيق
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS center_name text NOT NULL DEFAULT '';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS teacher_signature text NOT NULL DEFAULT '';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS supervisor_signature text NOT NULL DEFAULT '';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS manager_signature text NOT NULL DEFAULT '';
