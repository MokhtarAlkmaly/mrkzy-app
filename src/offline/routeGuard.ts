import { redirect } from "@tanstack/react-router";
import { ensureDbOpen } from "./dbManager";

/**
 * يُستدعى في beforeLoad لكل مسار يحتاج البيانات: يفتح قاعدة بيانات المجلد
 * المحفوظة تلقائياً، وإن لم يُختر مجلد بعد (أو سُحبت الصلاحية) يحوّل إلى
 * شاشة اختيار المجلد ثم يعود للصفحة نفسها.
 */
export const requireDatabase = async (location: { href: string }) => {
  const ok = await ensureDbOpen();
  if (!ok) {
    throw redirect({ to: "/setup", search: { next: location.href } as never });
  }
};
