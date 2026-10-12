/**
 * مخزن فوق FileSystemDirectoryHandle — يُستخدم في حالتين:
 *  - browser-folder: مجلد حقيقي يختاره المستخدم على الحاسب (Chrome/Edge) عبر
 *    showDirectoryPicker — الملفات تظهر في مستكشف الملفات ويمكن نسخها.
 *  - browser-opfs  : التخزين الداخلي الخاص بالمتصفح (Origin Private File System).
 *
 * createWritable() يكتب في ملف مؤقت ثم يستبدل الأصلي عند close()، لذلك
 * الكتابة ذرّية بطبيعتها (لا يبقى ملف نصف مكتوب).
 */

import { splitPath, type BackendKind, type FolderBackend, type FolderEntry } from "./types";

type PermissionMode = { mode: "read" | "readwrite" };
type PermissionAwareHandle = FileSystemDirectoryHandle & {
  queryPermission?: (desc: PermissionMode) => Promise<PermissionState>;
  requestPermission?: (desc: PermissionMode) => Promise<PermissionState>;
};
type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

const isNotFound = (err: unknown) =>
  err instanceof DOMException && (err.name === "NotFoundError" || err.name === "TypeMismatchError");

export class HandleBackend implements FolderBackend {
  readonly kind: BackendKind;
  readonly label: string;
  private readonly root: FileSystemDirectoryHandle;
  private objectUrls = new Map<string, string>();

  constructor(root: FileSystemDirectoryHandle, kind: BackendKind, label?: string) {
    this.root = root;
    this.kind = kind;
    this.label = label || root.name || "المجلد";
  }

  /** حالة صلاحية القراءة/الكتابة على المجلد (للمجلدات المختارة يدوياً). */
  static async queryPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
    const h = handle as PermissionAwareHandle;
    if (!h.queryPermission) return "granted";
    return h.queryPermission({ mode: "readwrite" });
  }

  /** يطلب الصلاحية — يجب استدعاؤها من داخل نقرة المستخدم. */
  static async requestPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
    const h = handle as PermissionAwareHandle;
    if (!h.requestPermission) return "granted";
    return h.requestPermission({ mode: "readwrite" });
  }

  private async dirFor(segments: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
    let dir = this.root;
    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg, { create });
    }
    return dir;
  }

  private async fileHandle(path: string, create: boolean): Promise<FileSystemFileHandle | null> {
    const parts = splitPath(path);
    const name = parts.pop();
    if (!name) throw new Error(`مسار ملف غير صالح: ${path}`);
    try {
      const dir = await this.dirFor(parts, create);
      return await dir.getFileHandle(name, { create });
    } catch (err) {
      if (!create && isNotFound(err)) return null;
      throw err;
    }
  }

  async readTopLevelTexts(suffixes: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for await (const [name, handle] of (this.root as IterableDirectoryHandle).entries()) {
      if (handle.kind !== "file") continue;
      if (!suffixes.some((s) => name.endsWith(s))) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      out[name] = await file.text();
    }
    return out;
  }

  async readText(path: string): Promise<string | null> {
    const handle = await this.fileHandle(path, false);
    if (!handle) return null;
    const file = await handle.getFile();
    return file.text();
  }

  private async write(path: string, data: string | Blob): Promise<void> {
    const handle = await this.fileHandle(path, true);
    if (!handle) throw new Error(`تعذّر إنشاء الملف: ${path}`);
    const writable = await handle.createWritable();
    try {
      await writable.write(data);
      await writable.close();
    } catch (err) {
      try {
        await writable.abort();
      } catch {
        /* لا شيء */
      }
      throw err;
    }
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.write(path, text);
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    await this.write(path, data);
    this.revoke(path);
  }

  async readBlob(path: string): Promise<Blob | null> {
    const handle = await this.fileHandle(path, false);
    if (!handle) return null;
    return handle.getFile();
  }

  async getDisplayUrl(path: string): Promise<string | null> {
    const cached = this.objectUrls.get(path);
    if (cached) return cached;
    const blob = await this.readBlob(path);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.objectUrls.set(path, url);
    return url;
  }

  private revoke(path: string) {
    const url = this.objectUrls.get(path);
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrls.delete(path);
    }
  }

  async remove(path: string): Promise<void> {
    const parts = splitPath(path);
    const name = parts.pop();
    if (!name) return;
    this.revoke(path);
    try {
      const dir = await this.dirFor(parts, false);
      await dir.removeEntry(name);
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
  }

  async list(dir: string): Promise<FolderEntry[]> {
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await this.dirFor(splitPath(dir), false);
    } catch (err) {
      if (isNotFound(err)) return [];
      throw err;
    }
    const out: FolderEntry[] = [];
    for await (const [name, entry] of (handle as IterableDirectoryHandle).entries()) {
      if (entry.kind === "directory") {
        out.push({ name, kind: "directory" });
      } else {
        const file = await (entry as FileSystemFileHandle).getFile();
        out.push({ name, kind: "file", size: file.size, lastModified: file.lastModified });
      }
    }
    return out;
  }

  dispose() {
    for (const url of this.objectUrls.values()) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }
}
