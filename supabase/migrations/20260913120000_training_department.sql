-- ==========================================================================
-- قسم التدريب والتأهيل: المتدربون، الدورات، والتسجيل في الدورات.
-- قسم مستقل تمامًا عن بيانات قسم القرآن الكريم (طلاب/معلمات/حفظ).
-- ==========================================================================

-- المتدربون (متدربون ومتدربات في الدورات التعليمية والمهنية)
CREATE TABLE public.trainees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  gender text NOT NULL DEFAULT 'female' CHECK (gender IN ('male', 'female')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainees TO authenticated;
GRANT ALL ON public.trainees TO service_role;
ALTER TABLE public.trainees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own trainees" ON public.trainees FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own trainees" ON public.trainees FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own trainees" ON public.trainees FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own trainees" ON public.trainees FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_trainees_updated_at BEFORE UPDATE ON public.trainees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- الدورات التعليمية والمهنية (خياطة، قيادة، نقش، روضة أطفال، ...)
CREATE TABLE public.training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'أخرى',
  instructor text,
  start_date date,
  end_date date,
  capacity integer,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_courses TO authenticated;
GRANT ALL ON public.training_courses TO service_role;
ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own training_courses" ON public.training_courses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own training_courses" ON public.training_courses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own training_courses" ON public.training_courses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own training_courses" ON public.training_courses FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_training_courses_updated_at BEFORE UPDATE ON public.training_courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- تسجيل المتدربين في الدورات (علاقة متعدد لمتعدد)
CREATE TABLE public.training_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trainee_id uuid NOT NULL REFERENCES public.trainees(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'completed', 'withdrawn')),
  enrolled_at date NOT NULL DEFAULT (now())::date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trainee_id, course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_enrollments TO authenticated;
GRANT ALL ON public.training_enrollments TO service_role;
ALTER TABLE public.training_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own training_enrollments" ON public.training_enrollments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own training_enrollments" ON public.training_enrollments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own training_enrollments" ON public.training_enrollments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own training_enrollments" ON public.training_enrollments FOR DELETE TO authenticated USING (auth.uid() = user_id);
