/**
 * مخزن أندرويد: مجلد يختاره المستخدم في ذاكرة الهاتف أو على بطاقة SD
 * (Storage Access Framework) — عبر الإضافة الأصلية FolderDb.
 */

import { Capacitor } from "@capacitor/core";
import { MEDIA_DIR } from "../constants";
import { FolderDb, type NativeFolderInfo } from "../native/folderDbPlugin";
import {
  base64ToBlob,
  blobToBase64,
  guessMimeType,
  splitPath,
  type FolderBackend,
  type FolderEntry,
} from "./types";

export class AndroidSafBackend implements FolderBackend {
  readonly kind = "android-saf" as const;
  readonly label: string;
  readonly info: NativeFolderInfo;
  private noMediaChecked = false;

  constructor(info: NativeFolderInfo) {
    this.info = info;
    this.label = info.path || info.name || "مجلد على الهاتف";
  }

  static isSupported(): boolean {
    return Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("FolderDb");
  }

  private norm(path: string) {
    return splitPath(path).join("/");
  }

  async readTopLevelTexts(suffixes: string[]): Promise<Record<string, string>> {
    // ملفاً ملفاً بدل دفعة واحدة: قاعدة بيانات كبيرة (سنوات من المتابعة الشهرية)
    // قد تصل لعدة ميجابايت، وتمريرها كرسالة واحدة عبر الجسر أثقل على الذاكرة.
    const { entries } = await FolderDb.listDir({ path: "" });
    const out: Record<string, string> = {};
    for (const e of entries || []) {
      if (e.isDir || !suffixes.some((s) => e.name.endsWith(s))) continue;
      const res = await FolderDb.readFile({ path: e.name, encoding: "utf8" });
      if (res.exists) out[e.name] = res.data ?? "";
    }
    return out;
  }

  async readText(path: string): Promise<string | null> {
    const res = await FolderDb.readFile({ path: this.norm(path), encoding: "utf8" });
    return res.exists ? (res.data ?? "") : null;
  }

  async writeText(path: string, text: string): Promise<void> {
    await FolderDb.writeFile({
      path: this.norm(path),
      data: text,
      encoding: "utf8",
      mimeType: guessMimeType(path),
      atomic: true,
    });
  }

  /**
   * ملف .nomedia داخل مجلد الوسائط: يمنع ظهور صوره ومقاطعه في «معرض الصور»؛
   * فهي نسخ من صور المعرض أصلاً، وقد يحذفها المستخدم من هناك ظناً أنها مكررة
   * فتختفي من التطبيق. لا يؤثر على عرضها داخل التطبيق.
   */
  private async ensureNoMedia(target: string): Promise<void> {
    if (this.noMediaChecked || !target.startsWith(`${MEDIA_DIR}/`)) return;
    this.noMediaChecked = true;
    const marker = `${MEDIA_DIR}/.nomedia`;
    try {
      const { uri } = await FolderDb.getFileUri({ path: marker });
      if (!uri) await FolderDb.writeFile({ path: marker, data: "", encoding: "utf8" });
    } catch {
      /* اختياري */
    }
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    const target = this.norm(path);
    await this.ensureNoMedia(target);
    const mimeType = data.type || guessMimeType(path);
    // الملفات الكبيرة (فيديو) تُكتب على دفعات حتى لا يُمرَّر الملف كاملاً عبر
    // الجسر كنص base64 ضخم قد يستنفد الذاكرة على الأجهزة المتواضعة.
    const CHUNK = 3 * 1024 * 1024; // مضاعف 3 حتى يبقى كل جزء base64 مستقلاً وصحيحاً
    await FolderDb.writeFile({
      path: target,
      data: await blobToBase64(data.slice(0, CHUNK)),
      encoding: "base64",
      mimeType,
      atomic: false,
    });
    try {
      for (let offset = CHUNK; offset < data.size; offset += CHUNK) {
        await FolderDb.appendFile({
          path: target,
          data: await blobToBase64(data.slice(offset, offset + CHUNK)),
        });
      }
    } catch (err) {
      try {
        await FolderDb.deleteFile({ path: target });
      } catch {
        /* أفضل محاولة */
      }
      throw err;
    }
  }

  async readBlob(path: string): Promise<Blob | null> {
    const res = await FolderDb.readFile({ path: this.norm(path), encoding: "base64" });
    if (!res.exists || res.data === undefined) return null;
    return base64ToBlob(res.data, guessMimeType(path));
  }

  async getDisplayUrl(path: string): Promise<string | null> {
    const { uri } = await FolderDb.getFileUri({ path: this.norm(path) });
    if (!uri) return null;
    // يحوّل content:// إلى https://localhost/_capacitor_content_/... الذي يخدمه
    // MediaRangeWebViewClient (مع دعم التقديم في الفيديو).
    return Capacitor.convertFileSrc(uri);
  }

  async getDisplayUrls(paths: string[]): Promise<Array<string | null>> {
    if (paths.length === 0) return [];
    const { uris } = await FolderDb.getFileUris({ paths: paths.map((p) => this.norm(p)) });
    return paths.map((_, i) => {
      const uri = uris?.[i];
      return uri ? Capacitor.convertFileSrc(uri) : null;
    });
  }

  async remove(path: string): Promise<void> {
    await FolderDb.deleteFile({ path: this.norm(path) });
  }

  async list(dir: string): Promise<FolderEntry[]> {
    const { entries } = await FolderDb.listDir({ path: splitPath(dir).join("/") });
    return (entries || []).map((e) => ({
      name: e.name,
      kind: e.isDir ? "directory" : "file",
      size: e.size,
      lastModified: e.lastModified,
    }));
  }
}
