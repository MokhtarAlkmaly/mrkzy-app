import { Capacitor } from "@capacitor/core";

/**
 * وجهة آمنة بعد تسجيل الدخول من معامل `?next=`: مسار داخلي فقط، يمنع
 * إعادة التوجيه إلى موقع خارجي (مثل `//evil.com` أو `https://...`).
 */
export const getSafeNextPath = (): string | null => {
  if (typeof window === "undefined") return null;
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
};

/**
 * رابط العودة الذي تضعه Supabase في رسائل البريد (تأكيد الحساب واستعادة
 * كلمة المرور): صفحة الدخول نفسها مع الحفاظ على وجهة `next`.
 *
 * داخل تطبيق أندرويد (Capacitor) يكون أصل الصفحة `https://localhost` وهو لا
 * يعمل خارج التطبيق، لذا نُرجع undefined لتستعمل Supabase «Site URL» المضبوط
 * في لوحة التحكم.
 *
 * ملاحظة: يجب إضافة `<رابط الموقع>/auth` إلى Redirect URLs في إعدادات
 * Supabase (Authentication → URL Configuration)، وإلا تُستعمل Site URL.
 */
export const getAuthEmailRedirect = (): string | undefined => {
  if (typeof window === "undefined") return undefined;
  if (Capacitor.isNativePlatform()) return undefined;
  const next = getSafeNextPath();
  const base = `${window.location.origin}/auth`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
};
