/**
 * محرك قاعدة البيانات المحلية — «المجلد هو قاعدة البيانات».
 *
 * - كل جدول يُحفظ كملف JSON مستقل في مجلد يختاره المستخدم (ذاكرة الهاتف،
 *   بطاقة SD، أو مجلد على الحاسب): students.json، year_data.json، ...
 * - عند الفتح تُقرأ كل الملفات إلى الذاكرة، وكل تعديل يُعلَّم «متسخاً» ثم
 *   يُكتب إلى المجلد بعد مهلة قصيرة (تجميع عدة تعديلات في كتابة واحدة).
 * - الكتابة آمنة: ملف مؤقت ثم استبدال (على أندرويد)، أو كتابة ذرّية (المتصفح).
 * - نسخة احتياطية يومية تلقائية داخل المجلد نفسه (backups/).
 * - قيود فريدة وحذف متسلسل (CASCADE) تماماً كما في مخطط PostgreSQL الأصلي.
 *
 * لا يحتاج أي اتصال بالإنترنت إطلاقاً.
 */

import {
  BACKUPS_DIR,
  DB_APP_ID,
  DB_FORMAT_VERSION,
  LOCAL_USER_ID,
  MANIFEST_FILE,
  MAX_DAILY_BACKUPS,
  README_FILE,
  TABLE_FILE_EXT,
  TMP_SUFFIX,
} from "./constants";
import {
  TABLES,
  getTableDef,
  referencingKeys,
  todayDate,
  type Row,
  type TableDef,
  type UniqueConstraint,
} from "./schema";
import type { BackendKind, FolderBackend } from "./backends/types";

export type { Row } from "./schema";

export interface DbManifest {
  app: string;
  format: number;
  name: string;
  created_at: string;
  updated_at: string;
  /** آخر رقم تسلسلي مستخدم لكل جدول ذي معرّف رقمي (مثل students). */
  sequences: Record<string, number>;
  /** عدد الصفوف في كل جدول عند آخر حفظ (للاطلاع فقط). */
  counts: Record<string, number>;
  last_backup_date: string | null;
}

export interface DbStatus {
  open: boolean;
  backendKind: BackendKind | null;
  folderLabel: string;
  saving: boolean;
  dirtyTables: number;
  lastSavedAt: number | null;
  lastError: string | null;
  warnings: string[];
  isNewDatabase: boolean;
}

export interface OpenResult {
  isNew: boolean;
  counts: Record<string, number>;
  warnings: string[];
}

export interface BackupSnapshot {
  app: string;
  format: number;
  kind: "backup";
  created_at: string;
  manifest?: Partial<DbManifest>;
  tables: Record<string, Row[]>;
}

/** خطأ بصيغة أخطاء PostgREST (message/code) حتى تتعامل معه الشاشات كما كانت. */
export class DbError extends Error {
  code: string;
  details: string | null;
  hint: string | null;
  constructor(code: string, message: string, details: string | null = null) {
    super(message);
    this.name = "DbError";
    this.code = code;
    this.details = details;
    this.hint = null;
  }
}

const nowIso = () => new Date().toISOString();

const newUuid = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const val = c === "x" ? r : (r & 0x3) | 0x8;
    return val.toString(16);
  });
};

/** مفتاح مقارنة موحّد للقيم (5 و "5" متساويان كما يفعل PostgreSQL مع التحويل). */
export const keyPart = (value: unknown): string => {
  if (value === null || value === undefined) return "\u0000null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const isPlainObject = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** نسخة من الصف حتى لا يعدّل المستدعي البيانات المخزنة دون قصد. */
export const cloneRow = (row: Row): Row => {
  const out: Row = {};
  for (const [k, val] of Object.entries(row)) {
    out[k] = typeof val === "object" && val !== null ? structuredCloneSafe(val) : val;
  }
  return out;
};

const structuredCloneSafe = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const serializeRows = (rows: Row[]): string =>
  rows.length === 0 ? "" : rows.map((r) => JSON.stringify(r)).join(",\n");

export const serializeTable = (name: string, rows: Row[], savedAt: string): string =>
  `{"app":${JSON.stringify(DB_APP_ID)},"format":${DB_FORMAT_VERSION},"table":${JSON.stringify(
    name,
  )},"saved_at":${JSON.stringify(savedAt)},"count":${rows.length},"rows":[\n${serializeRows(
    rows,
  )}\n]}\n`;

export const parseTableText = (text: string): Row[] => {
  const parsed: unknown = JSON.parse(text);
  const rows = Array.isArray(parsed)
    ? parsed
    : isPlainObject(parsed) && Array.isArray(parsed.rows)
      ? (parsed.rows as unknown[])
      : null;
  if (!rows) throw new Error("صيغة ملف الجدول غير معروفة");
  return rows.filter(isPlainObject);
};

export const serializeSnapshot = (snapshot: BackupSnapshot): string => {
  const tableParts = Object.entries(snapshot.tables).map(
    ([name, rows]) => `${JSON.stringify(name)}:[\n${serializeRows(rows)}\n]`,
  );
  return `{"app":${JSON.stringify(snapshot.app)},"format":${snapshot.format},"kind":"backup","created_at":${JSON.stringify(
    snapshot.created_at,
  )},"manifest":${JSON.stringify(snapshot.manifest ?? {})},"tables":{\n${tableParts.join(
    ",\n",
  )}\n}}\n`;
};

/** يتحقق من ملف نسخة احتياطية ويعيد جداوله. */
export const parseSnapshotText = (text: string): BackupSnapshot => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("الملف ليس ملف JSON صالحاً");
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.tables)) {
    throw new Error("الملف ليس نسخة احتياطية من تطبيق مركز إنماء");
  }
  if (typeof parsed.format === "number" && parsed.format > DB_FORMAT_VERSION) {
    throw new Error("هذه النسخة الاحتياطية من إصدار أحدث من التطبيق — حدّث التطبيق أولاً");
  }
  const tables: Record<string, Row[]> = {};
  for (const def of TABLES) {
    const rows = (parsed.tables as Record<string, unknown>)[def.name];
    tables[def.name] = Array.isArray(rows) ? rows.filter(isPlainObject) : [];
  }
  return {
    app: String(parsed.app ?? DB_APP_ID),
    format: Number(parsed.format ?? DB_FORMAT_VERSION),
    kind: "backup",
    created_at: String(parsed.created_at ?? ""),
    manifest: isPlainObject(parsed.manifest) ? (parsed.manifest as Partial<DbManifest>) : {},
    tables,
  };
};

const README_TEXT = `مجلد قاعدة بيانات «مركز إنماء الأهلي الخيري» — النسخة التي تعمل بدون إنترنت
==========================================================================

هذا المجلد هو قاعدة البيانات نفسها. كل جدول محفوظ في ملف JSON مستقل:
  students.json            الطلاب والطالبات
  year_data.json           بيانات الأعوام والدرجات
  monthly_tracking.json    المتابعة الشهرية
  teachers.json            المعلمون والمعلمات
  ... وبقية الجداول.

  mrkzy-db.json            ملف التعريف (لا تحذفه)
  backups/                 نسخ احتياطية يومية تلقائية (آخر ${MAX_DAILY_BACKUPS} يوماً)
  media/                   الصور والفيديوهات

نصائح:
- انسخ هذا المجلد كاملاً إلى مكان آخر (حاسب، فلاش، بطاقة أخرى) للاحتفاظ بنسخة.
- لنقل البيانات إلى جوال آخر: انسخ المجلد إليه ثم اختره من شاشة «قاعدة البيانات» في التطبيق.
- لا تعدّل الملفات يدوياً والتطبيق مفتوح.
`;

export type DbListener = () => void;
export type DbChangeListener = (tables: string[]) => void;

export class FolderDb {
  private data = new Map<string, Row[]>();
  private dirty = new Set<string>();
  private manifestDirty = false;
  private backend: FolderBackend | null = null;
  private manifest: DbManifest = FolderDb.newManifest();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;
  private retryDelay = 0;
  private listeners = new Set<DbListener>();
  private changeListeners = new Set<DbChangeListener>();
  private pendingChangeTables = new Set<string>();
  private changeTimer: ReturnType<typeof setTimeout> | null = null;
  /** مهلة تجميع التعديلات قبل الكتابة إلى المجلد (ملّي ثانية). */
  flushDelayMs: number;
  /** تعطيل النسخ اليومي (للاختبارات). */
  dailyBackups: boolean;

  status: DbStatus = FolderDb.closedStatus();

  constructor(options: { flushDelayMs?: number; dailyBackups?: boolean } = {}) {
    this.flushDelayMs = options.flushDelayMs ?? 400;
    this.dailyBackups = options.dailyBackups ?? true;
  }

  private static closedStatus(): DbStatus {
    return {
      open: false,
      backendKind: null,
      folderLabel: "",
      saving: false,
      dirtyTables: 0,
      lastSavedAt: null,
      lastError: null,
      warnings: [],
      isNewDatabase: false,
    };
  }

  private static newManifest(): DbManifest {
    const now = nowIso();
    return {
      app: DB_APP_ID,
      format: DB_FORMAT_VERSION,
      name: "قاعدة بيانات مركز إنماء الأهلي الخيري",
      created_at: now,
      updated_at: now,
      sequences: {},
      counts: {},
      last_backup_date: null,
    };
  }

  // ================= الحالة والاشتراكات =================

  isOpen(): boolean {
    return this.backend !== null;
  }

  getBackend(): FolderBackend | null {
    return this.backend;
  }

  getManifest(): DbManifest {
    return { ...this.manifest, sequences: { ...this.manifest.sequences } };
  }

  subscribe(fn: DbListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** إشعار (مجمّع) بالجداول التي تغيّرت — لتحديث الشاشات المفتوحة إن لزم. */
  onChange(fn: DbChangeListener): () => void {
    this.changeListeners.add(fn);
    return () => {
      this.changeListeners.delete(fn);
    };
  }

  private setStatus(patch: Partial<DbStatus>) {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
  }

  private requireOpen() {
    if (!this.backend) {
      throw new DbError(
        "DB_CLOSED",
        "قاعدة البيانات غير مفتوحة — اختر مجلد قاعدة البيانات أولاً من شاشة «قاعدة البيانات».",
      );
    }
  }

  // ================= الفتح والإغلاق =================

  /**
   * يفتح قاعدة البيانات من مجلد. إن كانت قاعدة أخرى مفتوحة تُحفظ تعديلاتها
   * أولاً، وتبقى مفتوحة إن فشل فتح المجلد الجديد.
   */
  async open(backend: FolderBackend): Promise<OpenResult> {
    const previous = this.backend;
    if (previous) {
      try {
        await this.flush();
      } catch (err) {
        console.error("تعذّر حفظ التعديلات قبل تبديل المجلد", err);
      }
    }

    const files = await backend.readTopLevelTexts([
      TABLE_FILE_EXT,
      `${TABLE_FILE_EXT}${TMP_SUFFIX}`,
    ]);
    const warnings: string[] = [];
    const stamp = nowIso().replace(/[:.]/g, "-");

    let manifest: DbManifest | null = null;
    for (const name of [MANIFEST_FILE, `${MANIFEST_FILE}${TMP_SUFFIX}`]) {
      const text = files[name];
      if (text === undefined) continue;
      try {
        const parsed = JSON.parse(text);
        if (isPlainObject(parsed)) {
          manifest = {
            ...FolderDb.newManifest(),
            ...(parsed as Partial<DbManifest>),
          } as DbManifest;
          break;
        }
      } catch {
        /* نجرب الملف المؤقت */
      }
    }

    if (manifest && manifest.format > DB_FORMAT_VERSION) {
      throw new DbError(
        "NEWER_FORMAT",
        "هذا المجلد أنشأه إصدار أحدث من التطبيق. حدّث التطبيق ثم أعد المحاولة.",
      );
    }

    const data = new Map<string, Row[]>();
    const dirty = new Set<string>();
    let foundAnyTable = false;

    for (const def of TABLES) {
      const mainName = `${def.name}${TABLE_FILE_EXT}`;
      const main = files[mainName];
      const tmp = files[`${mainName}${TMP_SUFFIX}`];
      let rows: Row[] | null = null;

      if (main !== undefined) {
        try {
          rows = parseTableText(main);
          foundAnyTable = true;
        } catch {
          rows = null;
        }
      }
      if (rows === null && tmp !== undefined) {
        // انقطعت كتابة سابقة بين حذف الملف القديم وإعادة تسمية المؤقت.
        try {
          rows = parseTableText(tmp);
          foundAnyTable = true;
          dirty.add(def.name);
        } catch {
          rows = null;
        }
      }
      if (rows === null && main !== undefined) {
        const keepName = `${def.name}.corrupt-${stamp}${TABLE_FILE_EXT}`;
        try {
          await backend.writeText(keepName, main);
        } catch {
          /* أفضل محاولة */
        }
        warnings.push(
          `تعذّرت قراءة ملف ${mainName} (قد يكون تالفاً). حُفظت نسخة منه باسم ${keepName} وبدأ الجدول فارغاً — يمكنك الاستعادة من النسخ الاحتياطية في شاشة «قاعدة البيانات».`,
        );
        dirty.add(def.name);
      }
      data.set(def.name, rows ?? []);
    }

    const isNew = !manifest && !foundAnyTable;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (previous && previous !== backend) previous.dispose?.();
    this.backend = backend;
    this.data = data;
    this.dirty = dirty;
    this.manifest = manifest ?? FolderDb.newManifest();
    this.manifestDirty = !manifest;
    this.retryDelay = 0;

    // ضبط العدّادات التسلسلية حسب أكبر معرّف موجود.
    for (const def of TABLES) {
      if (def.autoId === "serial") this.syncSerial(def.name);
    }

    if (isNew) {
      for (const def of TABLES) this.dirty.add(def.name);
      try {
        await backend.writeText(README_FILE, README_TEXT);
      } catch {
        /* غير ضروري */
      }
    }

    this.setStatus({
      open: true,
      backendKind: backend.kind,
      folderLabel: backend.label,
      saving: false,
      dirtyTables: this.dirty.size,
      lastSavedAt: null,
      lastError: null,
      warnings,
      isNewDatabase: isNew,
    });

    if (this.dirty.size > 0 || this.manifestDirty) {
      await this.flush();
    }

    return { isNew, counts: this.counts(), warnings };
  }

  /** يكتب أي تعديلات معلقة ثم يغلق قاعدة البيانات. */
  async close(): Promise<void> {
    if (!this.backend) return;
    try {
      await this.flush();
    } catch (err) {
      console.error("تعذّر حفظ آخر التعديلات قبل الإغلاق", err);
    }
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.backend.dispose?.();
    this.backend = null;
    this.data = new Map();
    this.dirty.clear();
    this.manifestDirty = false;
    this.setStatus(FolderDb.closedStatus());
  }

  /** يعيد قراءة الملفات من المجلد (بعد حفظ المعلّق). */
  async reload(): Promise<OpenResult> {
    this.requireOpen();
    const backend = this.backend as FolderBackend;
    await this.flush();
    return this.open(backend);
  }

  // ================= القراءة =================

  /** مرجع داخلي لصفوف الجدول — لا تعدّله مباشرة (استخدم دوال الكتابة). */
  rowsRef(table: string): Row[] {
    this.requireOpen();
    getTableDef(table);
    let rows = this.data.get(table);
    if (!rows) {
      rows = [];
      this.data.set(table, rows);
    }
    return rows;
  }

  /** نسخة من كل صفوف الجدول. */
  all(table: string): Row[] {
    return this.rowsRef(table).map(cloneRow);
  }

  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const def of TABLES) out[def.name] = this.data.get(def.name)?.length ?? 0;
    return out;
  }

  totalRows(): number {
    return Object.values(this.counts()).reduce((a, b) => a + b, 0);
  }

  // ================= الكتابة =================

  private syncSerial(table: string) {
    const rows = this.data.get(table) ?? [];
    let max = this.manifest.sequences[table] ?? 0;
    for (const row of rows) {
      const id = Number(row.id);
      if (Number.isFinite(id) && id > max) max = id;
    }
    if (max !== (this.manifest.sequences[table] ?? 0)) {
      this.manifest.sequences[table] = max;
      this.manifestDirty = true;
    }
  }

  private nextSerial(table: string): number {
    this.syncSerial(table);
    const next = (this.manifest.sequences[table] ?? 0) + 1;
    this.manifest.sequences[table] = next;
    this.manifestDirty = true;
    return next;
  }

  /** يكمّل صفاً جديداً بالقيم الافتراضية والمعرّف والطوابع الزمنية. */
  prepareInsert(def: TableDef, input: Row): Row {
    const row: Row = {};
    for (const [k, val] of Object.entries(input)) {
      if (val !== undefined) row[k] = val;
    }
    if (def.userScoped && (row.user_id === undefined || row.user_id === null)) {
      row.user_id = LOCAL_USER_ID;
    }
    for (const [col, make] of Object.entries(def.defaults ?? {})) {
      if (row[col] === undefined) row[col] = make();
    }
    if (def.autoId && (row.id === undefined || row.id === null || row.id === "")) {
      row.id = def.autoId === "serial" ? this.nextSerial(def.name) : newUuid();
    } else if (def.autoId === "serial") {
      const id = Number(row.id);
      if (Number.isFinite(id) && id > (this.manifest.sequences[def.name] ?? 0)) {
        this.manifest.sequences[def.name] = id;
        this.manifestDirty = true;
      }
    }
    const now = nowIso();
    if (def.createdAt && !row.created_at) row.created_at = now;
    if (def.updatedAt && !row.updated_at) row.updated_at = now;
    return row;
  }

  private constraintsFor(def: TableDef): UniqueConstraint[] {
    return [{ name: `${def.name}_pkey`, columns: def.primaryKey }, ...(def.unique ?? [])];
  }

  /** مفتاح القيد لصف معيّن، أو null إن كان القيد لا ينطبق (قيمة فارغة أو شرط جزئي). */
  private constraintKey(c: UniqueConstraint, row: Row): string | null {
    if (c.where && !c.where(row)) return null;
    const parts: string[] = [];
    for (const col of c.columns) {
      const val = row[col];
      if (val === null || val === undefined) return null; // NULL لا يتعارض في PostgreSQL
      parts.push(keyPart(val));
    }
    return parts.join("\u0001");
  }

  private duplicateError(table: string, c: UniqueConstraint, row: Row): DbError {
    const cols = c.columns.join(", ");
    const vals = c.columns.map((col) => String(row[col])).join(", ");
    return new DbError(
      "23505",
      `duplicate key value violates unique constraint "${c.name}"`,
      `Key (${cols})=(${vals}) already exists in ${table}.`,
    );
  }

  /** يتحقق أن الجدول (بعد التعديل المقترح) لا يخالف أي قيد فريد. */
  private assertUnique(def: TableDef, rows: Row[], onlyConstraints?: UniqueConstraint[]) {
    for (const c of onlyConstraints ?? this.constraintsFor(def)) {
      const seen = new Set<string>();
      for (const row of rows) {
        const key = this.constraintKey(c, row);
        if (key === null) continue;
        if (seen.has(key)) throw this.duplicateError(def.name, c, row);
        seen.add(key);
      }
    }
  }

  /** إدراج صفوف جديدة (يرمي خطأ 23505 عند التكرار). يعيد الصفوف المخزنة. */
  insertRows(table: string, inputs: Row[]): Row[] {
    const def = getTableDef(table);
    const rows = this.rowsRef(table);
    const prepared = inputs.map((r) => this.prepareInsert(def, r));
    for (const c of this.constraintsFor(def)) {
      const seen = new Set<string>();
      for (const row of rows) {
        const key = this.constraintKey(c, row);
        if (key !== null) seen.add(key);
      }
      for (const row of prepared) {
        const key = this.constraintKey(c, row);
        if (key === null) continue;
        if (seen.has(key)) throw this.duplicateError(table, c, row);
        seen.add(key);
      }
    }
    rows.push(...prepared);
    this.touch(table);
    return prepared;
  }

  /**
   * إدراج أو تحديث حسب أعمدة التعارض (ON CONFLICT ... DO UPDATE).
   * بدون أعمدة تعارض يُستخدم المفتاح الأساسي.
   */
  upsertRows(
    table: string,
    inputs: Row[],
    onConflict?: string[] | null,
    options: { ignoreDuplicates?: boolean } = {},
  ): Row[] {
    const def = getTableDef(table);
    const rows = this.rowsRef(table);
    const conflictCols = onConflict && onConflict.length > 0 ? onConflict : def.primaryKey;
    const matchConstraint: UniqueConstraint = {
      name: "on_conflict",
      columns: conflictCols,
      where: this.constraintsFor(def).find(
        (c) =>
          c.columns.length === conflictCols.length &&
          c.columns.every((x, i) => x === conflictCols[i]),
      )?.where,
    };

    const index = new Map<string, Row>();
    for (const row of rows) {
      const key = this.constraintKey(matchConstraint, row);
      if (key !== null) index.set(key, row);
    }

    const result: Row[] = [];
    const toInsert: Row[] = [];
    const now = nowIso();
    const backup = new Map<Row, Row>();

    for (const input of inputs) {
      const probe = { ...input };
      if (def.userScoped && (probe.user_id === undefined || probe.user_id === null)) {
        probe.user_id = LOCAL_USER_ID;
      }
      const key = this.constraintKey(matchConstraint, probe);
      const existing = key !== null ? index.get(key) : undefined;
      if (existing) {
        if (options.ignoreDuplicates) continue;
        if (!backup.has(existing)) backup.set(existing, { ...existing });
        for (const [k, val] of Object.entries(input)) {
          if (val !== undefined) existing[k] = val;
        }
        if (def.updatedAt && input.updated_at === undefined) existing.updated_at = now;
        result.push(existing);
      } else {
        const prepared = this.prepareInsert(def, probe);
        const newKey = this.constraintKey(matchConstraint, prepared);
        if (newKey !== null) index.set(newKey, prepared);
        toInsert.push(prepared);
        result.push(prepared);
      }
    }

    const candidate = [...rows, ...toInsert];
    try {
      this.assertUnique(def, candidate);
    } catch (err) {
      for (const [row, old] of backup) {
        for (const k of Object.keys(row)) delete row[k];
        Object.assign(row, old);
      }
      throw err;
    }
    rows.push(...toInsert);
    if (result.length > 0) this.touch(table);
    return result;
  }

  /** تحديث الصفوف المطابقة. يعيد الصفوف بعد التحديث. */
  updateRows(table: string, predicate: (row: Row) => boolean, patch: Row): Row[] {
    const def = getTableDef(table);
    const rows = this.rowsRef(table);
    const targets = rows.filter(predicate);
    if (targets.length === 0) return [];
    const now = nowIso();
    const cleanPatch: Row = {};
    for (const [k, val] of Object.entries(patch)) if (val !== undefined) cleanPatch[k] = val;
    const backups = targets.map((r) => ({ ...r }));
    for (const row of targets) {
      Object.assign(row, cleanPatch);
      if (def.updatedAt && cleanPatch.updated_at === undefined) row.updated_at = now;
    }
    const touched = Object.keys(cleanPatch);
    const affected = this.constraintsFor(def).filter((c) =>
      c.columns.some((col) => touched.includes(col)),
    );
    if (affected.length > 0) {
      try {
        this.assertUnique(def, rows, affected);
      } catch (err) {
        targets.forEach((row, i) => {
          for (const k of Object.keys(row)) delete row[k];
          Object.assign(row, backups[i]);
        });
        throw err;
      }
    }
    this.touch(table);
    return targets;
  }

  /** حذف الصفوف المطابقة مع الحذف المتسلسل للجداول المرتبطة. يعيد المحذوف. */
  deleteRows(table: string, predicate: (row: Row) => boolean): Row[] {
    const rows = this.rowsRef(table);
    const removed: Row[] = [];
    const kept: Row[] = [];
    for (const row of rows) (predicate(row) ? removed : kept).push(row);
    if (removed.length === 0) return [];
    this.data.set(table, kept);
    this.touch(table);

    for (const { from, fk } of referencingKeys(table)) {
      const refs = new Set(removed.map((r) => keyPart(r[fk.refColumn])));
      if (fk.onDelete === "cascade") {
        this.deleteRows(from.name, (r) => refs.has(keyPart(r[fk.column])));
      } else {
        this.updateRows(from.name, (r) => refs.has(keyPart(r[fk.column])), { [fk.column]: null });
      }
    }
    return removed;
  }

  /** يستبدل محتوى جدول بالكامل (للاستيراد والاستعادة). */
  replaceTable(table: string, rows: Row[]) {
    const def = getTableDef(table);
    this.requireOpen();
    this.data.set(
      table,
      rows.filter(isPlainObject).map((r) => cloneRow(r)),
    );
    if (def.autoId === "serial") this.syncSerial(table);
    this.touch(table);
  }

  /** يستبدل كل الجداول دفعة واحدة ثم يحفظ فوراً. */
  async replaceAll(tables: Record<string, Row[]>): Promise<void> {
    this.requireOpen();
    for (const def of TABLES) {
      this.data.set(def.name, (tables[def.name] ?? []).filter(isPlainObject).map(cloneRow));
      if (def.autoId === "serial") {
        this.manifest.sequences[def.name] = 0;
        this.syncSerial(def.name);
      }
      this.touch(def.name);
    }
    this.manifestDirty = true;
    await this.flush();
  }

  /** يعلّم الجدول بأنه تغيّر ويجدول الحفظ. */
  touch(table: string) {
    this.dirty.add(table);
    this.pendingChangeTables.add(table);
    if (!this.changeTimer) {
      this.changeTimer = setTimeout(() => {
        this.changeTimer = null;
        const tables = Array.from(this.pendingChangeTables);
        this.pendingChangeTables.clear();
        for (const fn of this.changeListeners) {
          try {
            fn(tables);
          } catch (err) {
            console.error(err);
          }
        }
      }, 0);
    }
    if (this.status.dirtyTables !== this.dirty.size) {
      this.setStatus({ dirtyTables: this.dirty.size });
    }
    this.scheduleFlush();
  }

  // ================= الحفظ إلى المجلد =================

  scheduleFlush(delay = this.flushDelayMs) {
    if (!this.backend) return;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush().catch(() => {
        /* الخطأ محفوظ في status.lastError ويُعاد المحاولة تلقائياً */
      });
    }, delay);
  }

  private scheduleRetry() {
    this.retryDelay = Math.min(this.retryDelay ? this.retryDelay * 2 : 3000, 60000);
    this.scheduleFlush(this.retryDelay);
  }

  /** هل توجد تعديلات لم تُكتب بعد إلى المجلد؟ */
  hasPendingWrites(): boolean {
    return this.dirty.size > 0 || this.manifestDirty || this.flushing !== null;
  }

  /** يكتب كل التعديلات المعلّقة إلى المجلد الآن. */
  async flush(): Promise<void> {
    if (this.flushing) {
      try {
        await this.flushing;
      } catch {
        /* سنعيد المحاولة أدناه */
      }
    }
    const backend = this.backend;
    if (!backend) return;
    if (this.dirty.size === 0 && !this.manifestDirty) return;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const tables = Array.from(this.dirty);
    this.dirty.clear();
    this.setStatus({ saving: true });

    const run = (async () => {
      const savedAt = nowIso();
      for (const name of tables) {
        const rows = this.data.get(name) ?? [];
        await backend.writeText(`${name}${TABLE_FILE_EXT}`, serializeTable(name, rows, savedAt));
      }

      // نسخة احتياطية يومية (مرة في اليوم، عند أول حفظ).
      const today = todayDate();
      if (this.dailyBackups && this.manifest.last_backup_date !== today && this.totalRows() > 0) {
        try {
          await backend.writeText(
            `${BACKUPS_DIR}/mrkzy-backup-${today}.json`,
            serializeSnapshot(this.snapshot()),
          );
          this.manifest.last_backup_date = today;
          await this.pruneDailyBackups(backend);
        } catch (err) {
          console.warn("تعذّر إنشاء النسخة الاحتياطية اليومية", err);
        }
      }

      this.manifest.updated_at = savedAt;
      this.manifest.counts = this.counts();
      await backend.writeText(MANIFEST_FILE, `${JSON.stringify(this.manifest, null, 2)}\n`);
      this.manifestDirty = false;
    })();

    this.flushing = run;
    try {
      await run;
      if (this.backend === backend) {
        this.retryDelay = 0;
        this.setStatus({ lastSavedAt: Date.now(), lastError: null });
      }
    } catch (err) {
      if (this.backend === backend) {
        for (const name of tables) this.dirty.add(name);
        this.manifestDirty = true;
        const message = err instanceof Error ? err.message : String(err);
        this.setStatus({ lastError: message });
        this.scheduleRetry();
      }
      throw err;
    } finally {
      this.flushing = null;
      this.setStatus({ saving: false, dirtyTables: this.dirty.size });
    }

    if (this.backend === backend && this.dirty.size > 0) this.scheduleFlush();
  }

  private async pruneDailyBackups(backend: FolderBackend) {
    const entries = await backend.list(BACKUPS_DIR);
    const daily = entries
      .filter((e) => e.kind === "file" && /^mrkzy-backup-\d{4}-\d{2}-\d{2}\.json$/.test(e.name))
      .map((e) => e.name)
      .sort();
    const excess = daily.length - MAX_DAILY_BACKUPS;
    for (let i = 0; i < excess; i++) {
      await backend.remove(`${BACKUPS_DIR}/${daily[i]}`);
    }
  }

  // ================= النسخ الاحتياطي =================

  snapshot(): BackupSnapshot {
    const tables: Record<string, Row[]> = {};
    for (const def of TABLES) tables[def.name] = this.data.get(def.name) ?? [];
    return {
      app: DB_APP_ID,
      format: DB_FORMAT_VERSION,
      kind: "backup",
      created_at: nowIso(),
      manifest: { name: this.manifest.name, created_at: this.manifest.created_at },
      tables,
    };
  }

  /** يكتب نسخة احتياطية كاملة داخل مجلد backups ويعيد اسم الملف. */
  async writeBackup(prefix = "mrkzy-manual"): Promise<string> {
    this.requireOpen();
    await this.flush();
    const stamp = nowIso().replace(/[:]/g, "-").replace(/\..+$/, "");
    const name = `${prefix}-${stamp}.json`;
    await (this.backend as FolderBackend).writeText(
      `${BACKUPS_DIR}/${name}`,
      serializeSnapshot(this.snapshot()),
    );
    return name;
  }
}
