/**
 * النسخ الاحتياطي والاستعادة لقاعدة بيانات المجلد.
 *
 * - نسخ داخل المجلد نفسه (backups/): يومية تلقائية + يدوية.
 * - تصدير ملف نسخة احتياطية (مشاركة على الجوال / تنزيل في المتصفح).
 * - استيراد ملف نسخة احتياطية (يستبدل كل البيانات بعد حفظ نسخة أمان).
 *
 * ملاحظة: النسخة الاحتياطية تشمل كل الجداول، أما ملفات الصور والفيديو
 * فتبقى في مجلد media/ — انسخ المجلد كاملاً للاحتفاظ بها.
 */

import { BACKUPS_DIR } from "./constants";
import { db } from "./dbManager";
import { parseSnapshotText, serializeSnapshot, type BackupSnapshot } from "./folderDb";
import { TABLES } from "./schema";

export interface FolderBackupInfo {
  name: string;
  size?: number;
  lastModified?: number;
  kind: "daily" | "manual" | "safety" | "other";
}

const backupKind = (name: string): FolderBackupInfo["kind"] => {
  if (name.startsWith("mrkzy-backup-")) return "daily";
  if (name.startsWith("mrkzy-manual-")) return "manual";
  if (name.startsWith("mrkzy-before-")) return "safety";
  return "other";
};

/** النسخ الاحتياطية الموجودة في مجلد backups (الأحدث أولاً). */
export const listFolderBackups = async (): Promise<FolderBackupInfo[]> => {
  const backend = db.getBackend();
  if (!backend) return [];
  const entries = await backend.list(BACKUPS_DIR);
  return entries
    .filter((e) => e.kind === "file" && e.name.endsWith(".json"))
    .map((e) => ({
      name: e.name,
      size: e.size,
      lastModified: e.lastModified,
      kind: backupKind(e.name),
    }))
    .sort((a, b) => b.name.localeCompare(a.name));
};

/** ينشئ نسخة احتياطية يدوية داخل المجلد ويعيد اسمها. */
export const createFolderBackup = async (): Promise<string> => db.writeBackup("mrkzy-manual");

/** عدد الصفوف في نسخة احتياطية (للعرض قبل الاستعادة). */
export const summarizeSnapshot = (snapshot: BackupSnapshot) => {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const def of TABLES) {
    const n = snapshot.tables[def.name]?.length ?? 0;
    counts[def.name] = n;
    total += n;
  }
  return { counts, total, students: counts.students ?? 0, createdAt: snapshot.created_at };
};

/** يقرأ نسخة احتياطية من مجلد backups. */
export const readFolderBackup = async (name: string): Promise<BackupSnapshot> => {
  const backend = db.getBackend();
  if (!backend) throw new Error("قاعدة البيانات غير مفتوحة");
  const text = await backend.readText(`${BACKUPS_DIR}/${name}`);
  if (text === null) throw new Error("ملف النسخة الاحتياطية غير موجود");
  return parseSnapshotText(text);
};

/** يستبدل كل البيانات بمحتوى نسخة احتياطية — بعد حفظ نسخة أمان من الحالية. */
export const restoreSnapshot = async (snapshot: BackupSnapshot): Promise<string | null> => {
  let safetyName: string | null = null;
  if (db.totalRows() > 0) {
    safetyName = await db.writeBackup("mrkzy-before-restore");
  }
  await db.replaceAll(snapshot.tables);
  return safetyName;
};

/** يستورد نص ملف نسخة احتياطية (بعد التحقق منه). */
export const parseBackupFileText = (text: string): BackupSnapshot => parseSnapshotText(text);

const backupFileName = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `mrkzy-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}.json`;
};

/**
 * يصدّر نسخة احتياطية كملف: مشاركة (حفظ في الملفات/واتساب/تيليجرام...) داخل
 * تطبيق أندرويد، أو تنزيل مباشر في المتصفح.
 */
export const exportBackupFile = async (): Promise<string> => {
  await db.flush();
  const text = serializeSnapshot(db.snapshot());
  const fileName = backupFileName();
  const { Capacitor } = await import("@capacitor/core");

  if (!Capacitor.isNativePlatform()) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return fileName;
  }

  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const result = await Filesystem.writeFile({
    path: fileName,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  await Share.share({ title: fileName, url: result.uri, dialogTitle: "حفظ/مشاركة النسخة الاحتياطية" });
  return fileName;
};
