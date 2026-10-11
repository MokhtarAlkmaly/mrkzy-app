import { useEffect } from "react";

let initPromise: Promise<void> | null = null;

/**
 * تهيئة قاعدة البيانات المحلية (SQLite/WASM ~1MB) ونقل الكاش القديم من IndexedDB.
 *
 * تُستدعى من المسارات التي تحتاج البيانات فعلاً (المنطقة المسجَّلة وبحث
 * المتابعة) بدل استدعائها من جذر التطبيق، حتى تبقى الصفحات العامة خفيفة —
 * وعلى رأسها «بوابة المعلم/ة» (`/teacher`) التي يفتحها المعلمون والمعلمات من
 * جوالاتهم بدون تسجيل دخول ولا يحتاجون فيها أي قاعدة بيانات محلية.
 *
 * الوعد مشترك، فاستدعاؤها من أكثر من مسار لا يكرر التهيئة.
 */
export const initLocalDatabase = (): Promise<void> => {
  initPromise ??= (async () => {
    const { getDB } = await import("@/utils/sqliteClient");
    await getDB();
    const { migrateLegacyIndexedDbCache } = await import("@/utils/migrateLegacyCache");
    await migrateLegacyIndexedDbCache();
  })().catch((err) => {
    // لا نُبقي على وعد فاشل: المحاولة القادمة يجب أن تعيد التهيئة.
    initPromise = null;
    console.error("تعذّرت تهيئة قاعدة البيانات المحلية (SQLite)", err);
  });
  return initPromise;
};

/** يشغّل تهيئة قاعدة البيانات المحلية مرة واحدة عند تركيب المكوّن. */
export const useLocalDatabase = () => {
  useEffect(() => {
    void initLocalDatabase();
  }, []);
};
