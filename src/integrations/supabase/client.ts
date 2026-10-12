/**
 * النسخة التي تعمل بدون إنترنت: لا يوجد خادم Supabase.
 *
 * `supabase` هنا عميل محلي بنفس الواجهة (from / rpc / auth / storage) يقرأ
 * ويكتب في «مجلد قاعدة البيانات» على الجهاز (ذاكرة الهاتف أو بطاقة SD) —
 * راجع src/offline/. أُبقي الاسم والمسار كما هما حتى تبقى كل الشاشات تعمل
 * بلا تعديل.
 *
 * ملاحظة: الأنواع (Database) ما زالت مولَّدة من مخطط Supabase الأصلي لأن
 * الجداول والأعمدة المحلية مطابقة له تماماً.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createLocalClient } from "@/offline/localClient";
import { db } from "@/offline/dbManager";

export const supabase = createLocalClient(() => db) as unknown as SupabaseClient<Database>;
