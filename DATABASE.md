# قاعدة بيانات مركز إنماء الأهلي الخيري

توثيق مخطط **Supabase (PostgreSQL)** المستخدم في التطبيق، مقابل أنواع TypeScript المولَّدة، وسكيمة SQLite المحلية.

آخر مراجعة: **2026-10-11** — 17 جدولاً في `public`، لا يوجد جدول أو عمود مفقود بين `supabase/migrations/` و`src/integrations/supabase/types.ts`.

---

## الملفات المرجعية

| الملف | الدور |
| --- | --- |
| `supabase/migrations/*.sql` | مصدر الحقيقة لإنشاء المخطط من الصفر |
| `src/integrations/supabase/types.ts` | أنواع العميل (`Database["public"]["Tables"]`) |
| `supabase/drop-all-tables.sql` | حذف كل جداول `public` الـ 17 ثم أي جدول متبقٍ |
| `src/utils/sqliteClient.ts` | سكيمة SQLite المحلية (مجموعة جزئية للكاش/الأوفلاين) |
| `src/utils/storage.ts` | طبقة CRUD السحابية لجداول القرآن/المالية/المتابعة |
| `supabase/config.toml` | `project_id = hzpvtmfgvddjkuzonict` |

### إعادة الإنشاء من الصفر

1. شغّل `supabase/drop-all-tables.sql` في **SQL Editor**.
2. طبّق الـ migrations بالترتيب الزمني لأسماء الملفات (أو `supabase db push` / ربط Git).
3. إن تغيّر المخطط: أعد توليد الأنواع:
   ```sh
   npx supabase gen types typescript --project-id hzpvtmfgvddjkuzonict > src/integrations/supabase/types.ts
   ```

---

## الجداول الـ 17

| # | الجدول | المجال | المفتاح الأساسي | مصدر الإنشاء |
| --- | --- | --- | --- | --- |
| 1 | `students` | قرآن | `id` BIGSERIAL | `20260325213517_…` |
| 2 | `hifz_history` | قرآن | `id` UUID | `20260325213517_…` |
| 3 | `year_data` | قرآن | `id` UUID | `20260325213517_…` |
| 4 | `user_settings` | إعدادات | `id` UUID | `20260325213517_…` |
| 5 | `media` | وسائط | `id` UUID | `20260406155120_…` |
| 6 | `teacher_bonuses` | معلمون | `id` UUID | `20260509140332_…` |
| 7 | `teachers` | معلمون | `id` UUID | `20260510142231_…` |
| 8 | `awards` | تكريم | `id` UUID | `20260720141412_…` |
| 9 | `donors` | مالية | `id` UUID | `20260728090414_…` |
| 10 | `ceremony_expenses` | مالية | `id` UUID | `20260728090414_…` |
| 11 | `certificates` | تكريم | `id` UUID | `20260728090414_…` |
| 12 | `student_competitions` | مسابقات | `id` UUID | `20260911120000_students_hub_additions.sql` |
| 13 | `exam_questions` | اختبارات | `id` UUID | `20260911120000_students_hub_additions.sql` |
| 14 | `trainees` | تدريب | `id` UUID | `20260913120000_training_department.sql` |
| 15 | `training_courses` | تدريب | `id` UUID | `20260913120000_training_department.sql` |
| 16 | `training_enrollments` | تدريب | `id` UUID | `20260913120000_training_department.sql` |
| 17 | `monthly_tracking` | متابعة شهرية | مركّب `(student_id, year, month)` — **بدون عمود `id`** | `20261011120000_monthly_tracking.sql` |

كل الجداول عليها **RLS** بسياسات `auth.uid() = user_id` لـ SELECT/INSERT/UPDATE/DELETE (ما عدا `user_settings` بلا سياسة DELETE صريحة).

---

## العلاقات

```mermaid
erDiagram
  students ||--o{ hifz_history : "student_id CASCADE"
  students ||--o{ year_data : "student_id CASCADE"
  trainees ||--o{ training_enrollments : "trainee_id CASCADE"
  training_courses ||--o{ training_enrollments : "course_id CASCADE"

  students {
    bigint id PK
    uuid user_id
    text name
    text teacher
  }
  monthly_tracking {
    integer student_id PK
    text year PK
    smallint month PK
    uuid user_id
  }
```

مفاتيح أجنبية مصرَّح بها في الـ migrations (داخل `public` أو إلى `auth.users`):

| الجدول | العمود | يشير إلى | ON DELETE |
| --- | --- | --- | --- |
| `students` | `user_id` | `auth.users(id)` | CASCADE |
| `hifz_history` | `user_id` | `auth.users(id)` | CASCADE |
| `hifz_history` | `student_id` | `students(id)` | CASCADE |
| `year_data` | `user_id` | `auth.users(id)` | CASCADE |
| `year_data` | `student_id` | `students(id)` | CASCADE |
| `user_settings` | `user_id` | `auth.users(id)` | CASCADE |
| `awards` | `user_id` | `auth.users(id)` | CASCADE |
| `training_enrollments` | `trainee_id` | `trainees(id)` | CASCADE |
| `training_enrollments` | `course_id` | `training_courses(id)` | CASCADE |

`types.ts` يعكس علاقات `public` فقط (لا يدرج `auth.users`): `hifz_history` → `students`، `year_data` → `students`، `training_enrollments` → `trainees` و`training_courses`.

**غير مربوط بـ FK رغم الارتباط المنطقي:**

- `monthly_tracking.student_id` → `students.id` (و`student_id` هنا `integer` بينما `students.id` هو `bigint`).
- `user_id` في معظم الجداول المتأخرة (`media`, `teachers`, `teacher_bonuses`, `donors`, `ceremony_expenses`, `certificates`, `student_competitions`, `exam_questions`, `trainees`, `training_courses`, `training_enrollments`, `monthly_tracking`) بلا `REFERENCES auth.users`. الحماية تتم عبر RLS.

---

## تفاصيل الأعمدة

الرموز: `PK` مفتاح أساسي، `U` فريد، `NN` NOT NULL، `d=` قيمة افتراضية.

### 1. `students`

سجل الطالبات/الطلاب عبر كل الأعوام.

| العمود | SQL | types.ts | ملاحظات |
| --- | --- | --- | --- |
| `id` | `BIGSERIAL PK` | `number` | |
| `user_id` | `UUID NN` → `auth.users` | `string` | |
| `name` | `TEXT NN d=''` | `string` | |
| `teacher` | `TEXT NN d=''` | `string` | اسم المعلمة/المعلم كنص، ليس FK |
| `created_at` | `timestamptz NN d=now()` | `string` | |
| `updated_at` | `timestamptz NN d=now()` | `string` | trigger |

### 2. `hifz_history`

قيمة الحفظ الأساسي لكل عام (`year_key` مثل `h1447`). **لا يوجد `updated_at`.** `UNIQUE(student_id, year_key)`.

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK d=gen_random_uuid()` | `string` |
| `user_id` | `UUID NN` → `auth.users` | `string` |
| `student_id` | `BIGINT NN` → `students` | `number` |
| `year_key` | `TEXT NN` | `string` |
| `value` | `TEXT NN d='0'` | `string` |
| `created_at` | `timestamptz NN d=now()` | `string` |

### 3. `year_data`

نتائج العام الدراسي (مسابقة سنوية، درجات، جائزة، ترتيب). `UNIQUE(student_id, year)`. عمود `teacher` أُضيف لاحقاً في `20260406160125_…`.

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` → `auth.users` | `string` |
| `student_id` | `BIGINT NN` → `students` | `number` |
| `year` | `TEXT NN` | `string` |
| `base_hifz` | `TEXT NN d='0'` | `string` |
| `total_hifz` | `TEXT NN d='0'` | `string` |
| `parts` | `TEXT NN d=''` | `string` |
| `annual` | `TEXT NN d=''` | `string` |
| `recitation` | `TEXT NN d=''` | `string` |
| `memorization` | `TEXT NN d=''` | `string` |
| `total` | `TEXT NN d='0'` | `string` |
| `grade` | `TEXT NN d=''` | `string` |
| `prize` | `TEXT NN d='0'` | `string` |
| `status_prize` | `TEXT NN d=''` | `string` |
| `rank` | `TEXT NN d='-'` | `string` |
| `teacher` | `TEXT NN d=''` | `string` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

### 4. `user_settings`

صف واحد لكل مستخدم (`user_id` UNIQUE). أعمدة لاحقة: `table_filters` ثم اسم المركز والتوقيعات.

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN UNIQUE` → `auth.users` | `string` |
| `active_year` | `TEXT NN d='1447'` | `string` |
| `table_filters` | `JSONB NN d='{}'` | `Json` |
| `center_name` | `TEXT NN d=''` | `string` |
| `teacher_signature` | `TEXT NN d=''` | `string` |
| `supervisor_signature` | `TEXT NN d=''` | `string` |
| `manager_signature` | `TEXT NN d=''` | `string` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

### 5. `media`

ميتاداتا ملفات الوسائط. الملفات نفسها في bucket التخزين `media` (خاص، مسار `{user_id}/...`). **لا يوجد `updated_at`.**

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` (بلا FK) | `string` |
| `year` | `TEXT NN` | `string` |
| `month` | `INTEGER NN CHECK (1–12)` | `number` |
| `title` | `TEXT NN d=''` | `string` |
| `file_path` | `TEXT NN` | `string` |
| `file_type` | `TEXT NN CHECK ('image','video')` | `string` |
| `file_size` | `BIGINT NN d=0` | `number` |
| `created_at` | `timestamptz NN` | `string` |

### 6. `teacher_bonuses`

حوافز شهرية للمعلمين. `UNIQUE(user_id, teacher_name, year, month)`.

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` | `string` |
| `teacher_name` | `TEXT NN` | `string` |
| `year` | `TEXT NN` | `string` |
| `month` | `INTEGER NN` | `number` |
| `amount` | `NUMERIC NN d=0` | `number` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

### 7. `teachers`

قائمة المعلمين لكل عام. `UNIQUE(user_id, year, name)`. فهرس `idx_teachers_user_year(user_id, year)`.

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` | `string` |
| `year` | `TEXT NN` | `string` |
| `name` | `TEXT NN` | `string` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

### 8. `awards`

تكريم نقدي/عيني. قيود: `award_type ∈ {khatm_bonus, ceremony, annual, certificate}`، `award_kind ∈ {cash, in_kind}`. `recipient_type` وُسِّع في `20260811120000_expand_awards_recipient_type.sql`. `funded_by` أُضيف في `20260728090414_…`.

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` → `auth.users` | `string` |
| `year` | `TEXT NN` | `string` |
| `recipient_type` | `TEXT NN` — انظر القيم أدناه | `string` |
| `recipient_name` | `TEXT NN` | `string` |
| `award_type` | `TEXT NN` | `string` |
| `award_kind` | `TEXT NN d='cash'` | `string` |
| `amount` | `NUMERIC NN d=0` | `number` |
| `item` | `TEXT` | `string \| null` |
| `student_name` | `TEXT` | `string \| null` |
| `notes` | `TEXT` | `string \| null` |
| `awarded_at` | `DATE NN d=today` | `string` |
| `funded_by` | `TEXT` | `string \| null` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

`recipient_type` المسموح: `teacher`, `male_teacher`, `student`, `male_student`, `orphan`, `needy`, `other`.

فهارس: `idx_awards_user_year`, `idx_awards_recipient`.

### 9. `donors`

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` | `string` |
| `year` | `TEXT NN` | `string` |
| `name` | `TEXT NN` | `string` |
| `donor_type` | `TEXT NN d='person'` | `string` |
| `phone` | `TEXT` | `string \| null` |
| `pledged_amount` | `NUMERIC NN d=0` | `number` |
| `paid_amount` | `NUMERIC NN d=0` | `number` |
| `in_kind` | `TEXT` | `string \| null` |
| `notes` | `TEXT` | `string \| null` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

### 10. `ceremony_expenses`

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` | `string` |
| `year` | `TEXT NN` | `string` |
| `category` | `TEXT NN d='supplies'` | `string` |
| `description` | `TEXT NN d=''` | `string` |
| `amount` | `NUMERIC NN d=0` | `number` |
| `spent_at` | `DATE NN d=today` | `string` |
| `funded_by` | `TEXT` | `string \| null` |
| `notes` | `TEXT` | `string \| null` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

### 11. `certificates`

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` | `string` |
| `year` | `TEXT NN` | `string` |
| `recipient_type` | `TEXT NN d='student'` | `string` |
| `recipient_name` | `TEXT NN` | `string` |
| `cert_type` | `TEXT NN d='khatm'` | `string` |
| `title` | `TEXT NN d=''` | `string` |
| `notes` | `TEXT` | `string \| null` |
| `issued_at` | `DATE NN d=today` | `string` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

### 12. `student_competitions`

مسابقات داخلية/خارجية (منفصلة عن المسابقة السنوية في `year_data`). `competition_type ∈ {internal, external}`.

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` | `string` |
| `year` | `TEXT NN` | `string` |
| `competition_type` | `TEXT NN d='internal'` | `string` |
| `student_name` | `TEXT NN` | `string` |
| `title` | `TEXT NN d=''` | `string` |
| `organizer` | `TEXT` | `string \| null` |
| `rank` | `TEXT NN d=''` | `string` |
| `score` | `TEXT NN d=''` | `string` |
| `held_at` | `DATE NN d=today` | `string` |
| `notes` | `TEXT` | `string \| null` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

### 13. `exam_questions`

بنك أسئلة الاختبارات. `question_type ∈ {mcq, true_false, written}`. عمود `category` أُضيف في `20261011120001_exam_questions_category.sql`.

يُستخدم الجدول من مكانين في صفحة أسئلة الاختبارات:

- **بنك إضافي**: إضافة/تعديل الأسئلة يدويًا (`mcq` / `true_false` / `written`).
- **نماذج الاختبار**: توليد أسئلة الحفظ من المصحف (صيغة «اقرأ من قوله تعالى ﴿…﴾ إلى قوله تعالى ﴿…﴾») وحفظها في البنك بـ `question_type = 'written'`، و`category` = فئة الحفظ (مثل «جزء عمّ»)، و`subject` = «سورة …»، و`correct_answer` = مرجع السؤال (السورة/الآيات/الصفحة)، و`notes` = اسم النموذج.

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` | `string` |
| `year` | `TEXT NN d=''` | `string` |
| `subject` | `TEXT NN d=''` | `string` |
| `question_type` | `TEXT NN d='mcq'` | `string` |
| `question` | `TEXT NN d=''` | `string` |
| `choices` | `JSONB NN d='[]'` | `Json` |
| `correct_answer` | `TEXT` | `string \| null` |
| `difficulty` | `TEXT NN d='متوسط'` | `string` |
| `notes` | `TEXT` | `string \| null` |
| `category` | `TEXT NN d=''` | `string` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

### 14. `trainees`

متدربو قسم التدريب (مستقل عن طلاب القرآن). `gender ∈ {male, female}`.

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` | `string` |
| `name` | `TEXT NN` | `string` |
| `phone` | `TEXT` | `string \| null` |
| `gender` | `TEXT NN d='female'` | `string` |
| `notes` | `TEXT` | `string \| null` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

### 15. `training_courses`

`status ∈ {active, finished, cancelled}`.

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` | `string` |
| `name` | `TEXT NN` | `string` |
| `category` | `TEXT NN d='أخرى'` | `string` |
| `instructor` | `TEXT` | `string \| null` |
| `start_date` | `DATE` | `string \| null` |
| `end_date` | `DATE` | `string \| null` |
| `capacity` | `INTEGER` | `number \| null` |
| `status` | `TEXT NN d='active'` | `string` |
| `notes` | `TEXT` | `string \| null` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

### 16. `training_enrollments`

تسجيل متعدد-لمتعدد. `UNIQUE(trainee_id, course_id)`. `status ∈ {enrolled, completed, withdrawn}`. **لا يوجد `updated_at`.**

| العمود | SQL | types.ts |
| --- | --- | --- |
| `id` | `UUID PK` | `string` |
| `user_id` | `UUID NN` | `string` |
| `trainee_id` | `UUID NN` → `trainees` | `string` |
| `course_id` | `UUID NN` → `training_courses` | `string` |
| `status` | `TEXT NN d='enrolled'` | `string` |
| `enrolled_at` | `DATE NN d=today` | `string` |
| `notes` | `TEXT` | `string \| null` |
| `created_at` | `timestamptz NN` | `string` |

### 17. `monthly_tracking`

متابعة محرم–رمضان (`month BETWEEN 1 AND 9`). أُنشئ أصلاً يدوياً في الإنتاج ثم ثُبِّت في الـ migrations بشكل idempotent (`IF NOT EXISTS`). **لا يوجد عمود `id`.**

| العمود | SQL | types.ts |
| --- | --- | --- |
| `user_id` | `UUID NN` | `string` |
| `student_id` | `INTEGER NN` (جزء من PK) | `number` |
| `year` | `TEXT NN` | `string` |
| `month` | `SMALLINT NN CHECK (1–9)` | `number` |
| `memorization_from_surah` / `_ayah` | `INTEGER` | `number \| null` |
| `memorization_to_surah` / `_ayah` | `INTEGER` | `number \| null` |
| `memorization_hifz_score` | `NUMERIC NN d=0` | `number` |
| `memorization_recitation_score` | `NUMERIC NN d=0` | `number` |
| `review_from_surah` / `_ayah` | `INTEGER` | `number \| null` |
| `review_to_surah` / `_ayah` | `INTEGER` | `number \| null` |
| `review_hifz_score` | `NUMERIC NN d=0` | `number` |
| `review_recitation_score` | `NUMERIC NN d=0` | `number` |
| `attendance_score` | `NUMERIC NN d=0` | `number` |
| `behavior_score` | `NUMERIC NN d=0` | `number` |
| `created_at` / `updated_at` | `timestamptz NN` | `string` |

---

## مراجعة `types.ts` مقابل الـ migrations

أُجريت مقارنة عمود-بعمود في 2026-10-11:

| الفحص | النتيجة |
| --- | --- |
| جداول في `types.ts` غير موجودة في migrations | **لا شيء** |
| جداول في migrations غير موجودة في `types.ts` | **لا شيء** |
| أعمدة في `types.ts` غير موجودة في migrations | **لا شيء** |
| أعمدة في migrations غير موجودة في `types.ts` | **لا شيء** |
| `Views` / `Functions` / `Enums` في الأنواع | فارغة (الدالة `update_updated_at_column` موجودة في SQL فقط، وهذا متوقع) |

أعمدة أُضيفت بـ `ALTER TABLE` وكلها منعكسة في الأنواع:

| الجدول | العمود | migration |
| --- | --- | --- |
| `year_data` | `teacher` | `20260406160125_…` |
| `user_settings` | `table_filters` | `20260505114152_…` |
| `awards` | `funded_by` | `20260728090414_…` |
| `user_settings` | `center_name`, `teacher_signature`, `supervisor_signature`, `manager_signature` | `20260911120000_…` |
| `exam_questions` | `category` | `20261011120001_…` |

### فروقات ليست نقص أعمدة (تُذكر للوعي)

1. **نوع `student_id`:** `students.id` = `bigint` بينما `monthly_tracking.student_id` = `integer`، ولا يوجد FK بينهما. الطرفان يظهران `number` في TypeScript.
2. **قيود CHECK / UNIQUE / الفهارس** لا تُمثَّل في `types.ts` (طبيعة أنواع Supabase المولَّدة).
3. **`NUMERIC` و`DATE` و`JSONB`** تُترجم إلى `number` / `string` / `Json`.
4. **جداول بلا `updated_at`:** `hifz_history`, `media`, `training_enrollments` — متطابقة في المصدرين.
5. **`user_settings` بلا سياسة DELETE** في الـ migrations؛ الأنواع لا تعكس السياسات.

---

## كائنات أخرى

### الدالة `public.update_updated_at_column()`

`BEFORE UPDATE` على كل جدول فيه `updated_at` ما عدا `training_enrollments` و`hifz_history` و`media` (لا عمود). تُحذف مع `drop-all-tables.sql` وتُعاد مع أول migration.

### التخزين `storage.buckets.media`

- أُنشئ عاماً ثم جُعل خاصاً (`public = false`).
- سياسات المسار: المجلد الأول = `auth.uid()`.
- التطبيق يوقّع الروابط عبر `supabase.storage.from("media")`.

### صلاحيات GRANT

الجداول من `awards` فما بعد تمنح `SELECT, INSERT, UPDATE, DELETE` لدور `authenticated` و`ALL` لـ `service_role`. الجداول الأقدم تعتمد على RLS + صلاحيات PostgREST الافتراضية.

---

## ترتيب الـ migrations

| الملف | ماذا يفعل |
| --- | --- |
| `20260325213517_ae27fcb4-…` | `students`, `hifz_history`, `year_data`, `user_settings` + RLS + الدالة + triggers |
| `20260406155120_e3558b0c-…` | `media` + bucket عام + سياسات storage |
| `20260406160125_ecba88f8-…` | `year_data.teacher` |
| `20260503133324_080d5921-…` | جعل bucket `media` خاصاً وإعادة سياسات storage |
| `20260504163210_1bca2b72-…` | سياسة UPDATE على `media` |
| `20260505114152_a0f211aa-…` | `user_settings.table_filters` |
| `20260509140332_08b2b60a-…` | `teacher_bonuses` |
| `20260510142231_f79308e3-…` | `teachers` |
| `20260720141412_bb5ec9e4-…` | `awards` |
| `20260728090414_f9612995-…` | `donors`, `ceremony_expenses`, `certificates`, `awards.funded_by` |
| `20260811120000_expand_awards_recipient_type.sql` | توسيع CHECK لـ `awards.recipient_type` |
| `20260911120000_students_hub_additions.sql` | `student_competitions`, `exam_questions`, توقيعات المركز |
| `20260913120000_training_department.sql` | `trainees`, `training_courses`, `training_enrollments` |
| `20261011120000_monthly_tracking.sql` | `monthly_tracking` (idempotent) |
| `20261011120001_exam_questions_category.sql` | `exam_questions.category` |

---

## SQLite المحلية (ليست نسخة كاملة من السحابة)

`src/utils/sqliteClient.ts` يخزّن كاشاً أوفلاين بأسماء مقاربة، **وليس** المخطط السحابي كاملاً:

موجود محلياً: `students`, `hifz_history`, `year_data`, `teachers`, `teacher_bonuses`, `donors`, `awards`, `ceremony_expenses`, `certificates`, `media`، إضافة إلى جداول محلية فقط: `settings`, `meta`, `pending_changes`.

**غير موجود محلياً** (السحابة فقط): `monthly_tracking`, `student_competitions`, `exam_questions`, `trainees`, `training_courses`, `training_enrollments`, و`user_settings` (يُستبدل بمخزن مفتاح/قيمة `settings`).

لا تستخدم سكيمة SQLite كمرجع لإنشاء جداول Supabase.

---

## أين يُستخدم كل جدول في التطبيق

| الجدول | المدخل الرئيسي |
| --- | --- |
| `students`, `hifz_history`, `year_data` | `src/utils/storage.ts`, صفحات الطلاب/التقارير/المسابقة |
| `teachers`, `teacher_bonuses` | `src/pages/Teachers.tsx`, `storage.ts` |
| `user_settings` | `src/pages/Settings.tsx`, `storage.ts` |
| `media` | `src/pages/Media.tsx` + Storage |
| `donors` | `src/pages/Donors.tsx` |
| `awards` | `src/pages/Awards.tsx` |
| `ceremony_expenses` | `src/pages/Expenses.tsx` |
| `certificates` | `src/pages/Certificates.tsx` |
| `monthly_tracking` | `src/pages/MonthlyTracking.tsx`, `MonthlyTrackingSearch.tsx` |
| `student_competitions` | `src/pages/StudentCompetition.tsx`, `Management.tsx` |
| `exam_questions` | `src/pages/ExamQuestions.tsx`, `Management.tsx` |
| `trainees` | `src/pages/Trainees.tsx`, `TrainingHome.tsx` |
| `training_courses` | `src/pages/Courses.tsx`, `TrainingHome.tsx` |
| `training_enrollments` | `src/pages/Trainees.tsx`, `Courses.tsx` |
