/**
 * قاعدة البيانات المجلدية (Folder Database) — قلب النسخة الأوفلاين.
 *
 * الفكرة: قاعدة البيانات كلها مجلد واحد اسمه `MrkzyDatabase` على ذاكرة
 * الهاتف، وداخله ملف JSON واحد لكل جدول:
 *
 *   MrkzyDatabase/
 *     mrkzy-db.json        ← بيان القاعدة (الإصدار، آخر تحديث، عدد الصفوف)
 *     students.json        ← { table, updatedAt, rows: [...] }
 *     teachers.json
 *     year_data.json
 *     monthly_tracking.json
 *     ... إلخ
 *     media_files/         ← ملفات الوسائط (صور/فيديو) نفسها
 *
 * المزايا:
 *  - تعمل دون أي إنترنت أو خادم، ويمكن نسخ المجلد كاملاً لأي جهاز آخر.
 *  - كل ملف JSON مقروء بأي محرر نصوص — لا حاجة لبرامج خاصة.
 *  - النسخ الاحتياطي = نسخ المجلد، أو زر «تصدير نسخة» الذي يكتب ملفاً
 *    واحداً يجمع كل الجداول.
 *
 * مكان المجلد (يختاره المستخدم من الإعدادات):
 *  - "documents" (افتراضي): مجلد المستندات — ظاهر في تطبيق «الملفات»
 *    تحت Documents/MrkzyDatabase ويمكن نسخه بالكابل أو البلوتوث.
 *  - "external": جذر الذاكرة الخارجية/الداخلية المشتركة MrkzyDatabase
 *    مباشرة (قد يحتاج إذن تخزين في بعض الأجهزة).
 *  - "data": ذاكرة التطبيق الخاصة (لا تظهر في الملفات، تُحذف بإلغاء التثبيت).
 *
 * على متصفح الويب (للتطوير/المعاينة فقط) تُحفظ الجداول في localStorage
 * بنفس الصيغة، لأن المتصفح لا يستطيع الكتابة في مجلد حقيقي دون إذن.
 */

export const DB_FOLDER = "MrkzyDatabase";
export const DB_MANIFEST = "mrkzy-db.json";
const DB_VERSION = 1;

export type FolderLocation = "documents" | "external" | "data";

export const FOLDER_LOCATION_LABELS: Record<FolderLocation, string> = {
  documents: "مجلد المستندات (ظاهر في تطبيق الملفات)",
  external: "الذاكرة الخارجية / جذر التخزين (MrkzyDatabase مباشرة)",
  data: "ذاكرة التطبيق الخاصة (مخفية)",
};

const LOCATION_SETTING_KEY = "mrkzy-db-location";

/** كل جداول قاعدة البيانات (اسم الجدول = اسم ملفه <table>.json). */
export const DB_TABLES = [
  "students",
  "hifz_history",
  "year_data",
  "teachers",
  "teacher_bonuses",
  "donors",
  "awards",
  "ceremony_expenses",
  "certificates",
  "media",
  "monthly_tracking",
  "monthly_submissions",
  "teacher_portals",
  "student_competitions",
  "exam_questions",
  "trainees",
  "training_courses",
  "training_enrollments",
  "user_settings",
  "profiles",
  "user_roles",
  "data_access_grants",
  "local_users",
] as const;

export type DbTable = (typeof DB_TABLES)[number];
export type DbRow = Record<string, unknown>;

/** مفاتيح الإسناد (لعمليات upsert) لكل جدول. */
export const TABLE_PRIMARY_KEYS: Record<string, string[]> = {
  students: ["id"],
  hifz_history: ["student_id", "year_key"],
  year_data: ["student_id", "year"],
  user_settings: ["user_id"],
  profiles: ["id"],
  user_roles: ["user_id", "role"],
  data_access_grants: ["owner_id", "grantee_id"],
  monthly_submissions: ["id"],
  local_users: ["id"],
};

export const primaryKeyOf = (table: string): string[] => TABLE_PRIMARY_KEYS[table] ?? ["id"];

const nowISO = () => new Date().toISOString();

const newId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

// ===================== اختيار مكان المجلد =====================

export const getFolderLocation = (): FolderLocation => {
  if (typeof window === "undefined") return "documents";
  try {
    const v = window.localStorage.getItem(LOCATION_SETTING_KEY);
    if (v === "external" || v === "data" || v === "documents") return v;
  } catch {
    /* تجاهل */
  }
  return "documents";
};

export const describeFolderPath = (loc: FolderLocation = getFolderLocation()): string => {
  switch (loc) {
    case "external":
      return `الذاكرة الخارجية › ${DB_FOLDER}/`;
    case "data":
      return `ذاكرة التطبيق الخاصة › ${DB_FOLDER}/`;
    default:
      return `المستندات › ${DB_FOLDER}/`;
  }
};

// ===================== طبقة التخزين الخام =====================
// على أندرويد: @capacitor/filesystem. على الويب: localStorage.

type FsModule = typeof import("@capacitor/filesystem");

let fsPromise: Promise<{ fs: FsModule; directory: string } | null> | null = null;

const loadFs = (): Promise<{ fs: FsModule; directory: string } | null> => {
  if (fsPromise) return fsPromise;
  fsPromise = (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.getPlatform() === "web") return null;
      const fs = await import("@capacitor/filesystem");
      const loc = getFolderLocation();
      const directory =
        loc === "external"
          ? fs.Directory.ExternalStorage
          : loc === "data"
            ? fs.Directory.Data
            : fs.Directory.Documents;
      return { fs, directory };
    } catch {
      return null;
    }
  })();
  return fsPromise;
};

/** عند تغيير مكان المجلد من الإعدادات نعيد تحميل طبقة التخزين. */
export const resetFolderLocationCache = () => {
  fsPromise = null;
  loadedTables.clear();
  tableCache.clear();
};

const webKey = (file: string) => `mrkzy-folder-db:${file}`;

const readRawFile = async (file: string): Promise<string | null> => {
  const loaded = await loadFs();
  if (!loaded) {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(webKey(file));
    } catch {
      return null;
    }
  }
  const { fs, directory } = loaded;
  try {
    const res = await fs.Filesystem.readFile({
      path: `${DB_FOLDER}/${file}`,
      directory: directory as never,
      encoding: fs.Encoding.UTF8,
    });
    return typeof res.data === "string" ? res.data : null;
  } catch {
    return null; // الملف غير موجود بعد
  }
};

const writeRawFile = async (file: string, content: string): Promise<void> => {
  const loaded = await loadFs();
  if (!loaded) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(webKey(file), content);
    } catch (err) {
      console.error("folderDB: فشل الحفظ في متصفح الويب", err);
    }
    return;
  }
  const { fs, directory } = loaded;
  await fs.Filesystem.writeFile({
    path: `${DB_FOLDER}/${file}`,
    directory: directory as never,
    encoding: fs.Encoding.UTF8,
    data: content,
    recursive: true,
  });
};

// ===================== ذاكرة الجداول + الحفظ المؤجل =====================

const tableCache = new Map<string, DbRow[]>();
const loadedTables = new Set<string>();
const loadPromises = new Map<string, Promise<DbRow[]>>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

const fileFor = (table: string) => `${table}.json`;

const loadTable = (table: string): Promise<DbRow[]> => {
  if (loadedTables.has(table)) return Promise.resolve(tableCache.get(table) ?? []);
  const inFlight = loadPromises.get(table);
  if (inFlight) return inFlight;
  const promise = (async () => {
    const raw = await readRawFile(fileFor(table));
    let rows: DbRow[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { rows?: DbRow[] } | DbRow[];
        rows = Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
      } catch {
        console.error(`folderDB: ملف الجدول ${table} تالف — يبدأ فارغاً`);
        rows = [];
      }
    }
    tableCache.set(table, rows);
    loadedTables.add(table);
    loadPromises.delete(table);
    return rows;
  })();
  loadPromises.set(table, promise);
  return promise;
};

const writeManifest = async () => {
  const counts: Record<string, number> = {};
  for (const t of DB_TABLES) counts[t] = (tableCache.get(t) ?? []).length;
  await writeRawFile(
    DB_MANIFEST,
    JSON.stringify(
      {
        app: "mrkzy-offline",
        version: DB_VERSION,
        updatedAt: nowISO(),
        location: getFolderLocation(),
        tables: counts,
      },
      null,
      2,
    ),
  ).catch(() => undefined);
};

const flushTable = async (table: string) => {
  flushTimers.delete(table);
  const rows = tableCache.get(table) ?? [];
  const payload = JSON.stringify(
    { table, version: DB_VERSION, updatedAt: nowISO(), rows },
    null,
    1,
  );
  try {
    await writeRawFile(fileFor(table), payload);
    void writeManifest();
  } catch (err) {
    console.error(`folderDB: فشل كتابة ${fileFor(table)}`, err);
  }
};

const scheduleFlush = (table: string) => {
  const existing = flushTimers.get(table);
  if (existing) clearTimeout(existing);
  flushTimers.set(
    table,
    setTimeout(() => void flushTable(table), 250),
  );
};

/** حفظ فوري لكل الجداول المعدّلة (قبل الإغلاق/التنقل). */
export const flushAllFolderTables = async () => {
  const pending = [...flushTimers.keys()];
  for (const t of pending) {
    const timer = flushTimers.get(t);
    if (timer) clearTimeout(timer);
    await flushTable(t);
  }
};

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushAllFolderTables();
  });
  window.addEventListener("pagehide", () => void flushAllFolderTables());
}

// ===================== واجهة قاعدة البيانات =====================

export const folderDB = {
  /** كل صفوف جدول ما (نسخة من الذاكرة بعد التحميل من المجلد). */
  async getAll(table: string): Promise<DbRow[]> {
    return [...(await loadTable(table))];
  },

  async replaceAll(table: string, rows: DbRow[]): Promise<void> {
    tableCache.set(table, [...rows]);
    loadedTables.add(table);
    scheduleFlush(table);
  },

  /** إدخال صف أو تحديثه حسب مفتاح الإسناد. */
  async upsert(table: string, input: DbRow | DbRow[], onConflict?: string): Promise<DbRow[]> {
    const rows = await loadTable(table);
    const items = Array.isArray(input) ? input : [input];
    const pk = onConflict ? onConflict.split(",").map((s) => s.trim()) : primaryKeyOf(table);
    const out: DbRow[] = [];
    for (const item of items) {
      const row: DbRow = { ...item };
      if (row.id == null && pk.length === 1 && pk[0] === "id") row.id = newId();
      if (row.created_at == null && "created_at" in row === false && pk[0] === "id") {
        // لا نفرض created_at على جداول لا تملكه؛ نضيفه فقط إن طلبه الكود أصلاً
      }
      const idx = rows.findIndex((r) => pk.every((k) => String(r[k]) === String(row[k])));
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], ...row };
        out.push(rows[idx]);
      } else {
        rows.push(row);
        out.push(row);
      }
    }
    scheduleFlush(table);
    return out;
  },

  async updateWhere(
    table: string,
    patch: DbRow,
    predicate: (row: DbRow) => boolean,
  ): Promise<DbRow[]> {
    const rows = await loadTable(table);
    const changed: DbRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (predicate(rows[i])) {
        rows[i] = { ...rows[i], ...patch };
        changed.push(rows[i]);
      }
    }
    if (changed.length) scheduleFlush(table);
    return changed;
  },

  async deleteWhere(table: string, predicate: (row: DbRow) => boolean): Promise<void> {
    const rows = await loadTable(table);
    const next = rows.filter((r) => !predicate(r));
    if (next.length !== rows.length) {
      tableCache.set(table, next);
      scheduleFlush(table);
    }
  },

  async clear(table: string): Promise<void> {
    tableCache.set(table, []);
    loadedTables.add(table);
    scheduleFlush(table);
  },
};

// ===================== تغيير مكان المجلد =====================

/**
 * ينقل قاعدة البيانات إلى مكان جديد: يقرأ كل الجداول من المكان الحالي،
 * يكتبها في المكان الجديد، ثم يبدّل الإعداد. يعيد false إن فشل النقل.
 */
export const moveFolderDatabase = async (loc: FolderLocation): Promise<boolean> => {
  try {
    await flushAllFolderTables();
    // حمّل كل الجداول في الذاكرة أولاً
    for (const t of DB_TABLES) await loadTable(t);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCATION_SETTING_KEY, loc);
    }
    resetFolderLocationCache();
    // أعد كتابة كل الجداول في المكان الجديد
    for (const t of DB_TABLES) await flushTable(t);
    await writeManifest();
    return true;
  } catch (err) {
    console.error("folderDB: فشل نقل قاعدة البيانات", err);
    return false;
  }
};

// ===================== النسخ الاحتياطي / الاستعادة =====================

export interface DatabaseBackup {
  app: "mrkzy-offline";
  version: number;
  exportedAt: string;
  tables: Record<string, DbRow[]>;
}

/** تجميع كل الجداول في نسخة واحدة (للحفظ كملف أو للاستيراد لاحقاً). */
export const exportDatabaseBackup = async (): Promise<DatabaseBackup> => {
  await flushAllFolderTables();
  const tables: Record<string, DbRow[]> = {};
  for (const t of DB_TABLES) tables[t] = await folderDB.getAll(t);
  return { app: "mrkzy-offline", version: DB_VERSION, exportedAt: nowISO(), tables };
};

/** كتابة النسخة الاحتياطية ملفاً واحداً بجانب مجلد القاعدة، وإرجاع مساره. */
export const writeDatabaseBackupFile = async (): Promise<string> => {
  const backup = await exportDatabaseBackup();
  const stamp = backup.exportedAt.slice(0, 10);
  const file = `mrkzy-backup-${stamp}.json`;
  const loaded = await loadFs();
  if (!loaded) {
    // ويب: تنزيل مباشر
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    a.click();
    URL.revokeObjectURL(url);
    return file;
  }
  const { fs, directory } = loaded;
  await fs.Filesystem.writeFile({
    path: file,
    directory: directory as never,
    encoding: fs.Encoding.UTF8,
    data: JSON.stringify(backup),
    recursive: true,
  });
  return file;
};

/** استعادة نسخة احتياطية (تستبدل كل البيانات الحالية). */
export const importDatabaseBackup = async (backup: DatabaseBackup): Promise<void> => {
  if (!backup || backup.app !== "mrkzy-offline" || typeof backup.tables !== "object") {
    throw new Error("ملف نسخة احتياطية غير صالح");
  }
  for (const t of DB_TABLES) {
    await folderDB.replaceAll(t, Array.isArray(backup.tables[t]) ? backup.tables[t] : []);
  }
  await flushAllFolderTables();
};

/** مسح قاعدة البيانات كاملة (كل الجداول) — يُستعمل عند تبديل الحساب محلياً فقط عند الحاجة. */
export const wipeFolderDatabase = async (): Promise<void> => {
  for (const t of DB_TABLES) await folderDB.clear(t);
  await flushAllFolderTables();
};

// ===================== ملفات الوسائط داخل المجلد =====================

const MEDIA_DIR = `${DB_FOLDER}/media_files`;

const fileToBase64 = (file: File | Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/** حفظ ملف وسيط داخل مجلد القاعدة وإرجاع مساره النسبي. */
export const saveMediaFile = async (filePath: string, file: File | Blob): Promise<void> => {
  const loaded = await loadFs();
  if (!loaded) {
    const base64 = await fileToBase64(file);
    const type = (file as File).type || "application/octet-stream";
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(webKey(`media:${filePath}`), `data:${type};base64,${base64}`);
      } catch {
        /* قد تمتلئ ذاكرة المتصفح — على أندرويد لا تحدث هذه المشكلة */
      }
    }
    return;
  }
  const { fs, directory } = loaded;
  const base64 = await fileToBase64(file);
  await fs.Filesystem.writeFile({
    path: `${MEDIA_DIR}/${filePath}`,
    directory: directory as never,
    data: base64,
    recursive: true,
  });
};

export const deleteMediaFile = async (filePath: string): Promise<void> => {
  const loaded = await loadFs();
  if (!loaded) {
    if (typeof window !== "undefined") window.localStorage.removeItem(webKey(`media:${filePath}`));
    return;
  }
  const { fs, directory } = loaded;
  try {
    await fs.Filesystem.deleteFile({
      path: `${MEDIA_DIR}/${filePath}`,
      directory: directory as never,
    });
  } catch {
    /* غير موجود */
  }
};

/** رابط قابل للعرض لملف وسيط محفوظ داخل المجلد. */
export const mediaFileUrl = async (filePath: string): Promise<string> => {
  const loaded = await loadFs();
  if (!loaded) {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(webKey(`media:${filePath}`)) || "";
  }
  const { fs, directory } = loaded;
  try {
    const uri = await fs.Filesystem.getUri({
      path: `${MEDIA_DIR}/${filePath}`,
      directory: directory as never,
    });
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.convertFileSrc(uri.uri);
  } catch {
    return "";
  }
};
