/**
 * «الاطلاع على بيانات مستخدم آخر» — ميزة خاصة بالنسخة السحابية متعددة
 * المستخدمين. في النسخة التي تعمل بدون إنترنت يوجد مستخدم واحد على الجهاز،
 * لذلك وضع الاطلاع معطّل دائماً. أُبقيت الدوال نفسها حتى لا تتغير الشاشات.
 */

export interface ViewAsTarget {
  id: string;
  name: string;
  email: string | null;
}

const LEGACY_STORAGE_KEY = "mrkzy.viewAs";

/** لا يوجد مستخدم آخر للاطلاع عليه محلياً. */
export const getViewAs = (): ViewAsTarget | null => null;

export const getViewAsId = (): string | null => null;

export const isViewingOtherUser = (): boolean => false;

/** بلا عمل محلياً (يمسح فقط أي قيمة قديمة محفوظة). */
export const setViewAs = (_target: ViewAsTarget | null) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* لا شيء */
  }
};

export const subscribeViewAs = (_fn: (target: ViewAsTarget | null) => void) => () => {};
