/**
 * مخزن في الذاكرة — للاختبارات الآلية فقط (لا يحفظ شيئاً بعد إغلاق الصفحة).
 */

import { splitPath, type FolderBackend, type FolderEntry } from "./types";

export class MemoryBackend implements FolderBackend {
  readonly kind = "memory" as const;
  readonly label: string;
  /** الملفات: المسار → نص أو Blob. مكشوفة للاختبارات. */
  readonly files = new Map<string, string | Blob>();
  /** عدد عمليات الكتابة (للاختبارات). */
  writes = 0;
  /** عند ضبطه تفشل كل عمليات الكتابة (لاختبار التعامل مع الأخطاء). */
  failWrites: Error | null = null;

  constructor(label = "ذاكرة مؤقتة") {
    this.label = label;
  }

  private norm(path: string) {
    return splitPath(path).join("/");
  }

  async readTopLevelTexts(suffixes: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [path, value] of this.files) {
      if (path.includes("/")) continue;
      if (typeof value !== "string") continue;
      if (suffixes.some((s) => path.endsWith(s))) out[path] = value;
    }
    return out;
  }

  async readText(path: string): Promise<string | null> {
    const value = this.files.get(this.norm(path));
    if (value === undefined) return null;
    return typeof value === "string" ? value : await value.text();
  }

  async writeText(path: string, text: string): Promise<void> {
    if (this.failWrites) throw this.failWrites;
    this.writes++;
    this.files.set(this.norm(path), text);
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    if (this.failWrites) throw this.failWrites;
    this.writes++;
    this.files.set(this.norm(path), data);
  }

  async readBlob(path: string): Promise<Blob | null> {
    const value = this.files.get(this.norm(path));
    if (value === undefined) return null;
    return typeof value === "string" ? new Blob([value]) : value;
  }

  async getDisplayUrl(path: string): Promise<string | null> {
    return this.files.has(this.norm(path)) ? `memory://${this.norm(path)}` : null;
  }

  async remove(path: string): Promise<void> {
    this.files.delete(this.norm(path));
  }

  async list(dir: string): Promise<FolderEntry[]> {
    const prefix = splitPath(dir).join("/");
    const base = prefix ? `${prefix}/` : "";
    const seen = new Map<string, FolderEntry>();
    for (const [path, value] of this.files) {
      if (!path.startsWith(base)) continue;
      const rest = path.slice(base.length);
      const slash = rest.indexOf("/");
      if (slash >= 0) {
        const name = rest.slice(0, slash);
        if (!seen.has(name)) seen.set(name, { name, kind: "directory" });
      } else {
        seen.set(rest, {
          name: rest,
          kind: "file",
          size: typeof value === "string" ? value.length : value.size,
        });
      }
    }
    return Array.from(seen.values());
  }
}
