/**
 * مخزن احتياطي داخل المتصفح عبر IndexedDB — يُستخدم فقط في المتصفحات التي لا
 * تدعم اختيار مجلد ولا التخزين الداخلي OPFS. يحاكي «مجلداً» بمفاتيح مسارات.
 */

import { splitPath, type FolderBackend, type FolderEntry } from "./types";

const DB_NAME = "mrkzy-net-files";
const STORE = "files";

interface StoredFile {
  path: string;
  text?: string;
  blob?: Blob;
  size: number;
  mtime: number;
}

const openIdb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "path" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("تعذّر فتح IndexedDB"));
  });

const reqToPromise = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("خطأ في IndexedDB"));
  });

export class IdbBackend implements FolderBackend {
  readonly kind = "browser-idb" as const;
  readonly label = "تخزين المتصفح الداخلي";
  private dbPromise: Promise<IDBDatabase> | null = null;
  private objectUrls = new Map<string, string>();

  static isSupported(): boolean {
    return typeof indexedDB !== "undefined";
  }

  private db() {
    this.dbPromise ??= openIdb();
    return this.dbPromise;
  }

  private async store(mode: IDBTransactionMode) {
    const db = await this.db();
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  private norm(path: string) {
    return splitPath(path).join("/");
  }

  private async all(): Promise<StoredFile[]> {
    const store = await this.store("readonly");
    return reqToPromise(store.getAll() as IDBRequest<StoredFile[]>);
  }

  async readTopLevelTexts(suffixes: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const file of await this.all()) {
      if (file.path.includes("/")) continue;
      if (!suffixes.some((s) => file.path.endsWith(s))) continue;
      if (typeof file.text === "string") out[file.path] = file.text;
      else if (file.blob) out[file.path] = await file.blob.text();
    }
    return out;
  }

  private async get(path: string): Promise<StoredFile | undefined> {
    const store = await this.store("readonly");
    return reqToPromise(store.get(this.norm(path)) as IDBRequest<StoredFile | undefined>);
  }

  async readText(path: string): Promise<string | null> {
    const file = await this.get(path);
    if (!file) return null;
    if (typeof file.text === "string") return file.text;
    return file.blob ? file.blob.text() : null;
  }

  async writeText(path: string, text: string): Promise<void> {
    const store = await this.store("readwrite");
    await reqToPromise(
      store.put({ path: this.norm(path), text, size: text.length, mtime: Date.now() }),
    );
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    const store = await this.store("readwrite");
    await reqToPromise(
      store.put({ path: this.norm(path), blob: data, size: data.size, mtime: Date.now() }),
    );
    this.revoke(this.norm(path));
  }

  async readBlob(path: string): Promise<Blob | null> {
    const file = await this.get(path);
    if (!file) return null;
    if (file.blob) return file.blob;
    return typeof file.text === "string" ? new Blob([file.text]) : null;
  }

  async getDisplayUrl(path: string): Promise<string | null> {
    const key = this.norm(path);
    const cached = this.objectUrls.get(key);
    if (cached) return cached;
    const blob = await this.readBlob(key);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.objectUrls.set(key, url);
    return url;
  }

  private revoke(key: string) {
    const url = this.objectUrls.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrls.delete(key);
    }
  }

  async remove(path: string): Promise<void> {
    const key = this.norm(path);
    this.revoke(key);
    const store = await this.store("readwrite");
    await reqToPromise(store.delete(key));
  }

  async list(dir: string): Promise<FolderEntry[]> {
    const prefix = splitPath(dir).join("/");
    const base = prefix ? `${prefix}/` : "";
    const seen = new Map<string, FolderEntry>();
    for (const file of await this.all()) {
      if (!file.path.startsWith(base)) continue;
      const rest = file.path.slice(base.length);
      const slash = rest.indexOf("/");
      if (slash >= 0) {
        const name = rest.slice(0, slash);
        if (!seen.has(name)) seen.set(name, { name, kind: "directory" });
      } else {
        seen.set(rest, { name: rest, kind: "file", size: file.size, lastModified: file.mtime });
      }
    }
    return Array.from(seen.values());
  }

  dispose() {
    for (const url of this.objectUrls.values()) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }
}
