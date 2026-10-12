/**
 * إدارة قاعدة البيانات المحلية: اختيار المجلد، فتحه تلقائياً عند تشغيل
 * التطبيق، حفظ الاختيار، والحفظ عند إغلاق/تصغير التطبيق.
 */

import { Capacitor } from "@capacitor/core";
import { FolderDb, type OpenResult } from "./folderDb";
import type { BackendKind, FolderBackend } from "./backends/types";
import { HandleBackend } from "./backends/handleBackend";
import { IdbBackend } from "./backends/idbBackend";
import { AndroidSafBackend } from "./backends/androidSafBackend";
import { FolderDb as FolderDbPlugin } from "./native/folderDbPlugin";

/** قاعدة البيانات الوحيدة في التطبيق. */
export const db = new FolderDb();

const CONFIG_KEY = "mrkzy-net.database";
const META_DB = "mrkzy-net-meta";
const META_STORE = "handles";
const FOLDER_HANDLE_KEY = "folder";
const OPFS_DIR = "mrkzy-db";

export interface SavedDbConfig {
  kind: BackendKind;
  label: string;
  savedAt: string;
}

export interface StorageOption {
  kind: BackendKind;
  title: string;
  description: string;
  recommended?: boolean;
}

const isBrowser = () => typeof window !== "undefined";

export const isNativeApp = (): boolean => isBrowser() && Capacitor.isNativePlatform();

// ================= حفظ الاختيار =================

export const readSavedConfig = (): SavedDbConfig | null => {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedDbConfig;
    return parsed && typeof parsed.kind === "string" ? parsed : null;
  } catch {
    return null;
  }
};

const writeSavedConfig = (config: SavedDbConfig | null) => {
  if (!isBrowser()) return;
  try {
    if (config) window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    else window.localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* التخزين محظور — يكفي الفتح الحالي */
  }
};

// مخزن صغير لحفظ مقبض المجلد المختار في المتصفح (لا يمكن حفظه في localStorage).
const metaDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(META_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("تعذّر فتح IndexedDB"));
  });

const metaGet = async <T>(key: string): Promise<T | undefined> => {
  const dbh = await metaDb();
  return new Promise((resolve, reject) => {
    const req = dbh.transaction(META_STORE, "readonly").objectStore(META_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
};

const metaSet = async (key: string, value: unknown): Promise<void> => {
  const dbh = await metaDb();
  return new Promise((resolve, reject) => {
    const req = dbh.transaction(META_STORE, "readwrite").objectStore(META_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

// ================= الخيارات المتاحة =================

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: Record<string, unknown>) => Promise<FileSystemDirectoryHandle>;
};

export const supportsFolderPicker = (): boolean =>
  isBrowser() &&
  !isNativeApp() &&
  typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function" &&
  window.isSecureContext &&
  window.self === window.top;

export const supportsOpfs = (): boolean =>
  isBrowser() &&
  !!navigator.storage &&
  typeof navigator.storage.getDirectory === "function" &&
  typeof FileSystemFileHandle !== "undefined" &&
  "createWritable" in FileSystemFileHandle.prototype;

export const getStorageOptions = (): StorageOption[] => {
  if (isNativeApp()) {
    return [
      {
        kind: "android-saf",
        title: "مجلد على الهاتف أو بطاقة الذاكرة (SD)",
        description:
          "اختر مجلداً (أو أنشئ مجلداً جديداً باسم MrkzyDB) في ذاكرة الهاتف أو على بطاقة SD. كل البيانات تُحفظ فيه كملفات، ويمكنك نسخه أو نقله لجوال آخر.",
        recommended: true,
      },
    ];
  }
  const options: StorageOption[] = [];
  if (supportsFolderPicker()) {
    options.push({
      kind: "browser-folder",
      title: "مجلد على هذا الجهاز",
      description:
        "اختر مجلداً على الحاسب أو فلاش USB. كل البيانات تُحفظ فيه كملفات JSON يمكنك نسخها احتياطياً.",
      recommended: true,
    });
  }
  options.push({
    kind: supportsOpfs() ? "browser-opfs" : "browser-idb",
    title: "التخزين الداخلي للمتصفح",
    description:
      "تُحفظ البيانات داخل المتصفح نفسه على هذا الجهاز. مناسب للتجربة — احرص على تصدير نسخة احتياطية بانتظام من شاشة «قاعدة البيانات».",
  });
  return options;
};

export const describeBackendKind = (kind: BackendKind | null | undefined): string => {
  switch (kind) {
    case "android-saf":
      return "مجلد على الهاتف / بطاقة SD";
    case "browser-folder":
      return "مجلد على الجهاز";
    case "browser-opfs":
    case "browser-idb":
      return "التخزين الداخلي للمتصفح";
    case "memory":
      return "ذاكرة مؤقتة";
    default:
      return "غير محدد";
  }
};

// ================= الفتح =================

let lifecycleInstalled = false;

/** يحفظ التعديلات المعلقة عند تصغير التطبيق أو إغلاق الصفحة. */
const installLifecycleHandlers = () => {
  if (lifecycleInstalled || !isBrowser()) return;
  lifecycleInstalled = true;
  const flushNow = () => {
    if (db.isOpen() && db.hasPendingWrites()) {
      void db.flush().catch(() => {
        /* الحالة تظهر في الواجهة */
      });
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
  window.addEventListener("pagehide", flushNow);
  // حدث Capacitor عند انتقال التطبيق للخلفية على أندرويد.
  document.addEventListener("pause", flushNow);
  window.addEventListener("beforeunload", flushNow);
};

const openOpfs = async (): Promise<FolderBackend> => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
  try {
    await navigator.storage.persist?.();
  } catch {
    /* اختياري */
  }
  return new HandleBackend(dir, "browser-opfs", "التخزين الداخلي للمتصفح");
};

/** يعيد بناء المخزن المحفوظ دون أي تفاعل من المستخدم (أو null إن لزم تفاعل). */
const restoreBackend = async (config: SavedDbConfig): Promise<FolderBackend | null> => {
  switch (config.kind) {
    case "android-saf": {
      if (!isNativeApp()) return null;
      const { folder } = await FolderDbPlugin.getFolder();
      if (!folder || !folder.hasPermission) return null;
      return new AndroidSafBackend(folder);
    }
    case "browser-folder": {
      if (!supportsFolderPicker()) return null;
      const handle = await metaGet<FileSystemDirectoryHandle>(FOLDER_HANDLE_KEY);
      if (!handle) return null;
      const permission = await HandleBackend.queryPermission(handle);
      if (permission !== "granted") return null;
      return new HandleBackend(handle, "browser-folder", handle.name);
    }
    case "browser-opfs":
      return supportsOpfs() ? openOpfs() : null;
    case "browser-idb":
      return IdbBackend.isSupported() ? new IdbBackend() : null;
    default:
      return null;
  }
};

let openingPromise: Promise<boolean> | null = null;
let lastOpenError: string | null = null;

export const getLastOpenError = () => lastOpenError;

const openBackend = async (backend: FolderBackend): Promise<OpenResult> => {
  const result = await db.open(backend);
  writeSavedConfig({ kind: backend.kind, label: backend.label, savedAt: new Date().toISOString() });
  installLifecycleHandlers();
  lastOpenError = null;
  return result;
};

/**
 * يفتح قاعدة البيانات المحفوظة تلقائياً (بدون نوافذ). يعيد false إن لم يُختر
 * مجلد بعد أو احتاج المستخدم لإعادة منح الصلاحية — عندها تُعرض شاشة الاختيار.
 */
export const ensureDbOpen = (): Promise<boolean> => {
  if (db.isOpen()) return Promise.resolve(true);
  if (!isBrowser()) return Promise.resolve(false);
  openingPromise ??= (async () => {
    try {
      const config = readSavedConfig();
      if (!config) return false;
      const backend = await restoreBackend(config);
      if (!backend) return false;
      await openBackend(backend);
      return true;
    } catch (err) {
      console.error("تعذّر فتح قاعدة البيانات المحلية", err);
      lastOpenError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      openingPromise = null;
    }
  })();
  return openingPromise;
};

/** يفتح نافذة اختيار المجلد (أو التخزين الداخلي) ثم يفتح قاعدة البيانات منه. */
export const pickAndOpen = async (kind: BackendKind): Promise<OpenResult> => {
  let backend: FolderBackend;
  switch (kind) {
    case "android-saf": {
      const { folder } = await FolderDbPlugin.pickFolder();
      backend = new AndroidSafBackend(folder);
      break;
    }
    case "browser-folder": {
      const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
      if (!picker) throw new Error("هذا المتصفح لا يدعم اختيار المجلدات");
      const handle = await picker({ id: "mrkzy-db", mode: "readwrite", startIn: "documents" });
      await metaSet(FOLDER_HANDLE_KEY, handle);
      backend = new HandleBackend(handle, "browser-folder", handle.name);
      break;
    }
    case "browser-opfs":
      backend = await openOpfs();
      break;
    case "browser-idb":
      backend = new IdbBackend();
      break;
    default:
      throw new Error("نوع تخزين غير مدعوم");
  }
  return openBackend(backend);
};

/** هل يوجد مجلد محفوظ يحتاج فقط إعادة منح الصلاحية (المتصفح)؟ */
export const getReconnectableFolder = async (): Promise<string | null> => {
  const config = readSavedConfig();
  if (!config || config.kind !== "browser-folder" || !supportsFolderPicker()) return null;
  try {
    const handle = await metaGet<FileSystemDirectoryHandle>(FOLDER_HANDLE_KEY);
    return handle ? handle.name : null;
  } catch {
    return null;
  }
};

/** يعيد طلب صلاحية المجلد المحفوظ (يجب استدعاؤه من نقرة المستخدم). */
export const reconnectSavedFolder = async (): Promise<OpenResult> => {
  const handle = await metaGet<FileSystemDirectoryHandle>(FOLDER_HANDLE_KEY);
  if (!handle) throw new Error("لا يوجد مجلد محفوظ");
  const permission = await HandleBackend.requestPermission(handle);
  if (permission !== "granted") throw new Error("لم تُمنح صلاحية الوصول إلى المجلد");
  return openBackend(new HandleBackend(handle, "browser-folder", handle.name));
};

/** يغلق قاعدة البيانات (بعد الحفظ). forget=true ينسى المجلد أيضاً. */
export const closeDb = async (forget = false): Promise<void> => {
  await db.close();
  if (forget) {
    const config = readSavedConfig();
    writeSavedConfig(null);
    if (config?.kind === "android-saf" && isNativeApp()) {
      try {
        await FolderDbPlugin.forgetFolder();
      } catch {
        /* لا شيء */
      }
    }
  }
};
