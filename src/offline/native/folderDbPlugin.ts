/**
 * واجهة JavaScript للإضافة الأصلية FolderDb (أندرويد).
 *
 * التنفيذ الأصلي في:
 *   android/app/src/main/java/org/inmaa/mrkzynet/FolderDbPlugin.java
 *
 * تعتمد على Storage Access Framework: يختار المستخدم مجلداً (في ذاكرة الهاتف
 * أو بطاقة SD) من نافذة النظام، فيحصل التطبيق على صلاحية دائمة للقراءة
 * والكتابة داخله فقط — بدون صلاحية «كل الملفات» وبدون إنترنت.
 */

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface NativeFolderInfo {
  /** رابط شجرة SAF (content://...). */
  uri: string;
  /** اسم المجلد الظاهر. */
  name: string;
  /** وصف مقروء للمسار، مثل «ذاكرة الهاتف/Documents/MrkzyDB». */
  path: string;
  /** هل ما زالت صلاحية القراءة/الكتابة محفوظة؟ */
  hasPermission: boolean;
  /** هل المجلد على بطاقة ذاكرة خارجية (SD)؟ */
  removable?: boolean;
}

export interface NativeDirEntry {
  name: string;
  isDir: boolean;
  size: number;
  lastModified: number;
}

export interface FolderDbPlugin {
  /** المجلد المحفوظ سابقاً (إن وجد). */
  getFolder(): Promise<{ folder: NativeFolderInfo | null }>;
  /** يفتح نافذة اختيار المجلد في النظام ويحفظ الصلاحية بشكل دائم. */
  pickFolder(): Promise<{ folder: NativeFolderInfo }>;
  /** ينسى المجلد الحالي ويتخلى عن صلاحيته. */
  forgetFolder(): Promise<void>;
  /** يقرأ كل الملفات النصية في جذر المجلد ذات اللواحق المعطاة دفعة واحدة. */
  readTopLevel(options: {
    suffixes: string[];
  }): Promise<{ files: Array<{ name: string; data: string }> }>;
  readFile(options: {
    path: string;
    encoding: "utf8" | "base64";
  }): Promise<{ exists: boolean; data?: string }>;
  /** atomic=true: يكتب ملفاً مؤقتاً ثم يستبدل به الأصلي. */
  writeFile(options: {
    path: string;
    data: string;
    encoding: "utf8" | "base64";
    mimeType?: string;
    atomic?: boolean;
  }): Promise<void>;
  /** يُلحق بيانات base64 بنهاية ملف موجود (كتابة الملفات الكبيرة على دفعات). */
  appendFile(options: { path: string; data: string }): Promise<void>;
  deleteFile(options: { path: string }): Promise<void>;
  listDir(options: { path: string }): Promise<{ entries: NativeDirEntry[] }>;
  /** رابط content:// لملف داخل المجلد (لعرض الصور والفيديو). */
  getFileUri(options: { path: string }): Promise<{ uri: string | null }>;
  /** حدث انتقال التطبيق للخلفية (لحفظ التعديلات المعلقة فوراً). */
  addListener(eventName: "appPause", listener: () => void): Promise<PluginListenerHandle>;
}

// تسجيل واحد فقط حتى مع إعادة تحميل الوحدة أثناء التطوير (HMR).
const globalCache = globalThis as unknown as { __mrkzyFolderDbPlugin?: FolderDbPlugin };
export const FolderDb: FolderDbPlugin = (globalCache.__mrkzyFolderDbPlugin ??=
  registerPlugin<FolderDbPlugin>("FolderDb"));
