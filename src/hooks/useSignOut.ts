import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { flushLocalDatabase } from "@/hooks/useLocalDatabase";

/**
 * قبل أي عملية تمسح الكاش المحلي (تسجيل الخروج أو الدخول لوضع الاطلاع):
 * يرفع التعديلات المعلّقة إلى السحابة، وإن تعذّر ذلك (لا يوجد اتصال) يطلب
 * تأكيد المستخدم بدل حذف عمله غير المرفوع بصمت.
 * يُرجع true إن جاز المتابعة.
 */
export const confirmCacheReset = async (action: string): Promise<boolean> => {
  try {
    const { flushPendingChanges } = await import("@/utils/storage");
    const remaining = await flushPendingChanges();
    if (remaining === 0) return true;
    return window.confirm(
      `لديك ${remaining} تعديل لم يُرفع إلى السحابة بعد (لا يوجد اتصال بالإنترنت).\n` +
        `${action} الآن سيحذف هذه التعديلات من هذا الجهاز نهائياً.\n\n` +
        "يُفضَّل الانتظار حتى عودة الاتصال. هل تريد المتابعة رغم ذلك؟",
    );
  } catch (error) {
    // فشل غير متوقع في الفحص لا يمنع الخروج.
    console.error("تعذّر فحص التعديلات المعلّقة:", error);
    return true;
  }
};

/**
 * تسجيل خروج آمن: يرفع التعديلات المعلّقة (أو يطلب التأكيد إن تعذّر)، ويحفظ
 * الكتابات المحلية المؤجَّلة، ثم يُنهي الجلسة. يُرجع false إن ألغى المستخدم.
 */
export const useSignOut = () => {
  const { signOut } = useAuth();
  return useCallback(async () => {
    if (!(await confirmCacheReset("تسجيل الخروج"))) return false;
    await flushLocalDatabase();
    await signOut();
    return true;
  }, [signOut]);
};
