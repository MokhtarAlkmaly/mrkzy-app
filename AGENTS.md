# ملاحظات للمطوّرين

هذه النسخة **أوفلاين بالكامل** (قاعدة بيانات مجلدية على الجهاز + مستخدمون
محليون). ليست مرتبطة بـ Lovable ولا بـ Supabase:

- لا تضف أي استدعاء شبكة/سحابة — كل البيانات عبر
  `src/integrations/supabase/client.ts` (الواجهة المحلية) فوق
  `src/utils/folderDB.ts`.
- شغّل قبل أي دفع: `npm run lint && npm run typecheck && npm run test:offline && npm run build`.
