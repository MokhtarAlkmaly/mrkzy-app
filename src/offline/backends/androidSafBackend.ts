/**
 * مخزن أندرويد: مجلد يختاره المستخدم في ذاكرة الهاتف أو على بطاقة SD
 * (Storage Access Framework) — عبر الإضافة الأصلية FolderDb.
 */

import { Capacitor } from "@capacitor/core";
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
    const { files } = await FolderDb.readTopLevel({ suffixes });
    const out: Record<string, string> = {};
    for (const f of files || []) out[f.name] = f.data;
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

  async writeBlob(path: string, data: Blob): Promise<void> {
    const target = this.norm(path);
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
    // يحوّل content:// إلى رابط يخدمه خادم Capacitor المحلي داخل WebView.
    return Capacitor.convertFileSrc(uri);
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
