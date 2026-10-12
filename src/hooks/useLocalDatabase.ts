import { useEffect } from "react";
import { ensureDbOpen } from "@/offline/dbManager";

/**
 * يتأكد أن قاعدة بيانات المجلد مفتوحة (تفتح تلقائياً من المجلد المحفوظ).
 *
 * الفتح الفعلي يحدث في beforeLoad للمسارات (انظر requireDatabase في
 * src/offline/routeGuard.ts) قبل عرض أي شاشة تحتاج البيانات؛ هذه الدالة
 * احتياط إضافي فقط ولا تكرر الفتح (الوعد مشترك).
 */
export const initLocalDatabase = async (): Promise<void> => {
  await ensureDbOpen();
};

/** يشغّل التأكد من فتح قاعدة البيانات مرة واحدة عند تركيب المكوّن. */
export const useLocalDatabase = () => {
  useEffect(() => {
    void initLocalDatabase();
  }, []);
};
