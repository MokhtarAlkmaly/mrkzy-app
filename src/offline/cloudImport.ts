/**
 * نقل البيانات من النسخة السحابية (Supabase) إلى مجلد قاعدة البيانات — مرة
 * واحدة فقط وتحتاج إنترنت أثناء النقل. بعدها يعمل التطبيق بدون إنترنت تماماً.
 *
 * يسجّل الدخول بحساب النسخة السحابية نفسه، ينزّل كل جداول هذا الحساب (مع
 * الصور والفيديوهات اختيارياً)، ثم يستبدل بها البيانات المحلية بعد حفظ نسخة
 * أمان منها. مكتبة Supabase تُحمَّل فقط عند استخدام هذه الشاشة.
 */

import { LOCAL_USER_ID, MEDIA_DIR } from "./constants";
import { db } from "./dbManager";
import { TABLES, type Row } from "./schema";

/** عنوان ومفتاح مشروع النسخة السحابية الأصلية (المفتاح العام anon — آمن للعرض). */
export const DEFAULT_CLOUD_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "https://ueskpslsvfbiupqqcpwy.supabase.co";
export const DEFAULT_CLOUD_KEY: string =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlc2twc2xzdmZiaXVwcXFjcHd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MDE3MzAsImV4cCI6MjEwMzQ3NzczMH0.4e17EWpCHU_sTHQe7hm4UrCIzhrepVFILWGcwUflEcM";

const PAGE_SIZE = 1000;

/** جداول الحساب في السحابة مع ترتيب ثابت للتقسيم إلى صفحات. */
const CLOUD_TABLES: Array<{ name: string; order: string[] }> = [
  { name: "students", order: ["id"] },
  { name: "year_data", order: ["id"] },
  { name: "hifz_history", order: ["id"] },
  { name: "monthly_tracking", order: ["student_id", "year", "month"] },
  { name: "teachers", order: ["id"] },
  { name: "teacher_bonuses", order: ["id"] },
  { name: "teacher_portals", order: ["id"] },
  { name: "monthly_submissions", order: ["id"] },
  { name: "awards", order: ["id"] },
  { name: "certificates", order: ["id"] },
  { name: "donors", order: ["id"] },
  { name: "ceremony_expenses", order: ["id"] },
  { name: "student_competitions", order: ["id"] },
  { name: "exam_questions", order: ["id"] },
  { name: "media", order: ["id"] },
  { name: "trainees", order: ["id"] },
  { name: "training_courses", order: ["id"] },
  { name: "training_enrollments", order: ["id"] },
  { name: "user_settings", order: ["id"] },
];

export interface CloudImportOptions {
  url: string;
  key: string;
  email: string;
  password: string;
  includeMedia: boolean;
  onProgress?: (current: number, total: number, label: string) => void;
}

export interface CloudImportResult {
  counts: Record<string, number>;
  mediaCopied: number;
  mediaFailed: number;
  safetyBackup: string | null;
}

const LABELS = new Map(TABLES.map((t) => [t.name, t.label]));

const friendlyError = (err: unknown): Error => {
  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err);
  if (/invalid login credentials/i.test(message)) {
    return new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة");
  }
  if (/email not confirmed/i.test(message)) {
    return new Error("البريد الإلكتروني لهذا الحساب غير مؤكَّد");
  }
  if (/failed to fetch|network|fetch failed|load failed/i.test(message)) {
    return new Error("تعذّر الاتصال بالخادم — تأكد من اتصال الإنترنت ثم أعد المحاولة");
  }
  return new Error(message || "حدث خطأ غير متوقع أثناء النقل");
};

export const importFromCloud = async (options: CloudImportOptions): Promise<CloudImportResult> => {
  if (!db.isOpen()) throw new Error("افتح مجلد قاعدة البيانات أولاً");
  const progress = options.onProgress ?? (() => {});
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(options.url.trim(), options.key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const totalSteps = CLOUD_TABLES.length + 3;
  let step = 0;
  progress(step, totalSteps, "تسجيل الدخول إلى النسخة السحابية");

  let uid: string;
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: options.email.trim(),
      password: options.password,
    });
    if (error) throw error;
    if (!data.user) throw new Error("تعذّر تسجيل الدخول");
    uid = data.user.id;
  } catch (err) {
    throw friendlyError(err);
  }

  try {
    const tables: Record<string, Row[]> = {};
    for (const t of CLOUD_TABLES) {
      progress(++step, totalSteps, `تنزيل: ${LABELS.get(t.name) ?? t.name}`);
      const rows: Row[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- أسماء جداول ديناميكية
        let query = (client.from(t.name as any) as any).select("*").eq("user_id", uid);
        for (const col of t.order) query = query.order(col, { ascending: true });
        const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data || []) as Row[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      tables[t.name] = rows.map((r) => ({ ...r, user_id: LOCAL_USER_ID }));
    }

    progress(++step, totalSteps, "تنزيل الملف الشخصي");
    const { data: profile } = await client
      .from("profiles")
      .select("display_name, email, created_at")
      .eq("id", uid)
      .maybeSingle();
    tables.profiles = [
      {
        id: LOCAL_USER_ID,
        display_name: profile?.display_name ?? null,
        email: profile?.email ?? options.email.trim(),
        created_at: profile?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    // الإعدادات التي يقرؤها التطبيق من مخزن مفتاح/قيمة المحلي.
    const settings = tables.user_settings?.[0];
    const appSettings = new Map<string, unknown>(
      db.all("app_settings").map((r) => [String(r.key), r.value]),
    );
    if (settings) {
      for (const key of ["active_year", "table_filters", "student_custom_columns", "student_statuses"]) {
        if (settings[key] !== undefined && settings[key] !== null) appSettings.set(key, settings[key]);
      }
    }
    tables.app_settings = Array.from(appSettings.entries()).map(([key, value]) => ({ key, value }));

    // الصور والفيديوهات
    let mediaCopied = 0;
    let mediaFailed = 0;
    const mediaRows = tables.media ?? [];
    if (options.includeMedia && mediaRows.length > 0) {
      const backend = db.getBackend();
      if (!backend) throw new Error("قاعدة البيانات غير مفتوحة");
      for (let i = 0; i < mediaRows.length; i++) {
        const row = mediaRows[i];
        const cloudPath = String(row.file_path || "");
        progress(step, totalSteps, `تنزيل الوسائط ${i + 1}/${mediaRows.length}`);
        if (!cloudPath) continue;
        const localPath = cloudPath.startsWith(`${uid}/`) ? cloudPath.slice(uid.length + 1) : cloudPath;
        try {
          const { data, error } = await client.storage.from("media").download(cloudPath);
          if (error || !data) throw error ?? new Error("فشل التنزيل");
          await backend.writeBlob(`${MEDIA_DIR}/${localPath}`, data);
          row.file_path = localPath;
          mediaCopied++;
        } catch (err) {
          console.warn("تعذّر تنزيل ملف وسائط", cloudPath, err);
          mediaFailed++;
        }
      }
    }

    progress(++step, totalSteps, "حفظ البيانات في المجلد");
    let safetyBackup: string | null = null;
    if (db.totalRows() > 0) safetyBackup = await db.writeBackup("mrkzy-before-cloud-import");
    await db.replaceAll(tables);

    progress(totalSteps, totalSteps, "اكتمل النقل");
    const counts: Record<string, number> = {};
    for (const [name, rows] of Object.entries(tables)) counts[name] = rows.length;
    return { counts, mediaCopied, mediaFailed, safetyBackup };
  } catch (err) {
    throw friendlyError(err);
  } finally {
    try {
      await client.auth.signOut();
    } catch {
      /* لا شيء */
    }
  }
};
