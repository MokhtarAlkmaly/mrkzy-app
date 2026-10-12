import { useSyncExternalStore } from "react";
import { db } from "./dbManager";
import type { DbStatus } from "./folderDb";

const subscribe = (cb: () => void) => db.subscribe(cb);
const getSnapshot = (): DbStatus => db.status;

/** حالة قاعدة البيانات المحلية (المجلد، الحفظ، الأخطاء) — تتحدّث تلقائياً. */
export const useDbStatus = (): DbStatus => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
