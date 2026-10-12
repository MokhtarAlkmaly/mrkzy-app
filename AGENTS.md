# ملاحظات للوكلاء والمطورين

هذا المستودع هو **النسخة التي تعمل بدون إنترنت** (Mrkzy-net) من نظام مركز إنماء:

- لا يوجد خادم ولا Supabase. طبقة البيانات في `src/offline/` (قاعدة بيانات ملفات JSON داخل مجلد
  يختاره المستخدم)، و`src/integrations/supabase/client.ts` يصدّر عميلاً **محلياً** بنفس واجهة Supabase.
- لا تُدخل أي اعتماد على الشبكة في المسار الأساسي للتطبيق. الاستثناء الوحيد: `src/offline/cloudImport.ts`
  (نقل لمرة واحدة من النسخة السحابية، يُحمَّل عند الطلب فقط).
- أي جدول/عمود جديد: أضفه في `src/offline/schema.ts` (القيم الافتراضية، القيود الفريدة، الحذف المتسلسل)،
  وحدّث `src/integrations/supabase/types.ts` للأنواع.
- قبل الدفع: `npm run typecheck && npm run test:db`.
- الإضافة الأصلية لأندرويد: `android/app/src/main/java/org/inmaa/mrkzynet/FolderDbPlugin.java`
  (واجهتها في `src/offline/native/folderDbPlugin.ts`).

<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->
