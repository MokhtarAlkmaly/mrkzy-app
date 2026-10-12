/**
 * واجهة «مخزن المجلد»: طبقة رفيعة تقرأ وتكتب ملفات داخل مجلد قاعدة البيانات.
 *
 * التنفيذات:
 *  - android-saf    : مجلد يختاره المستخدم على الهاتف أو بطاقة SD (تطبيق أندرويد).
 *  - browser-folder : مجلد على الحاسب عبر File System Access API (Chrome/Edge).
 *  - browser-opfs   : تخزين المتصفح الداخلي (Origin Private File System).
 *  - browser-idb    : تخزين المتصفح الداخلي عبر IndexedDB (احتياطي للمتصفحات القديمة).
 *  - memory         : للاختبارات فقط.
 *
 * كل المسارات نسبية لجذر المجلد وبفاصل "/" (مثل "students.json" أو "media/1447/a.jpg").
 */

export type BackendKind =
  "android-saf" | "browser-folder" | "browser-opfs" | "browser-idb" | "memory";

export interface FolderEntry {
  name: string;
  kind: "file" | "directory";
  size?: number;
  lastModified?: number;
}

export interface FolderBackend {
  readonly kind: BackendKind;
  /** وصف المجلد للعرض في الواجهة (اسم/مسار). */
  readonly label: string;
  /**
   * يقرأ كل الملفات النصية في جذر المجلد التي ينتهي اسمها بإحدى اللواحق المعطاة
   * دفعة واحدة (أسرع بكثير من قراءتها ملفاً ملفاً، خصوصاً على أندرويد).
   */
  readTopLevelTexts(suffixes: string[]): Promise<Record<string, string>>;
  readText(path: string): Promise<string | null>;
  /** كتابة آمنة: لا يبقى الملف نصف مكتوب إن انقطعت الكتابة. */
  writeText(path: string, text: string): Promise<void>;
  writeBlob(path: string, data: Blob): Promise<void>;
  readBlob(path: string): Promise<Blob | null>;
  /** رابط يصلح لوسوم <img>/<video> لعرض ملف من المجلد. */
  getDisplayUrl(path: string): Promise<string | null>;
  /** حذف ملف (لا خطأ إن لم يكن موجوداً). */
  remove(path: string): Promise<void>;
  /** محتويات مجلد فرعي (أو الجذر عند ""). */
  list(dir: string): Promise<FolderEntry[]>;
  /** تحرير الموارد (روابط blob المؤقتة...). */
  dispose?(): void;
}

/** يقسم المسار إلى مقاطع ويرفض أي محاولة للخروج من المجلد. */
export const splitPath = (path: string): string[] => {
  const parts = path
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== ".");
  if (parts.some((p) => p === "..")) {
    throw new Error(`مسار غير مسموح: ${path}`);
  }
  return parts;
};

export const guessMimeType = (path: string): string => {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    json: "application/json",
    txt: "text/plain",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    bmp: "image/bmp",
    mp4: "video/mp4",
    m4v: "video/mp4",
    webm: "video/webm",
    "3gp": "video/3gpp",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    pdf: "application/pdf",
  };
  return map[ext] || "application/octet-stream";
};

/** تحويل Blob إلى base64 (بدون البادئة data:). */
export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("تعذّرت قراءة الملف"));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });

export const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
};
