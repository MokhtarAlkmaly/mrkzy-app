/**
 * عميل محلي بنفس شكل عميل Supabase (from / rpc / auth / storage) — يعمل فوق
 * قاعدة بيانات المجلد بدون أي اتصال بالإنترنت.
 *
 * يُصدَّر من src/integrations/supabase/client.ts باسم `supabase` حتى تبقى
 * الشاشات القائمة تعمل كما هي.
 */

import { LOCAL_USER_EMAIL, LOCAL_USER_ID, MEDIA_DIR } from "./constants";
import type { FolderDb } from "./folderDb";
import { LocalQueryBuilder, toPostgrestError, type LocalResponse } from "./query";
import { callRpc } from "./rpc";

const LOCAL_CREATED_AT = "2026-01-01T00:00:00.000Z";

export const getLocalUser = (db: FolderDb | null) => {
  let displayName: string | null = null;
  try {
    if (db?.isOpen()) {
      const profile = db.rowsRef("profiles").find((p) => p.id === LOCAL_USER_ID);
      displayName = (profile?.display_name as string | null) ?? null;
    }
  } catch {
    displayName = null;
  }
  return {
    id: LOCAL_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: LOCAL_USER_EMAIL,
    app_metadata: { provider: "local" },
    user_metadata: { display_name: displayName },
    identities: [],
    created_at: LOCAL_CREATED_AT,
    updated_at: LOCAL_CREATED_AT,
  };
};

export const getLocalSession = (db: FolderDb | null) => ({
  access_token: "local",
  refresh_token: "local",
  token_type: "bearer",
  expires_in: 315360000,
  expires_at: 4102444800,
  user: getLocalUser(db),
});

/** نتيجة RPC قابلة للانتظار (await) مثل supabase.rpc. */
class LocalRpcCall implements PromiseLike<LocalResponse> {
  private singleMode: "single" | "maybeSingle" | null = null;
  constructor(
    private readonly getDb: () => FolderDb,
    private readonly fn: string,
    private readonly args: Record<string, unknown>,
  ) {}

  single(): this {
    this.singleMode = "single";
    return this;
  }
  maybeSingle(): this {
    this.singleMode = "maybeSingle";
    return this;
  }

  async execute(): Promise<LocalResponse> {
    try {
      let data = callRpc(this.getDb(), this.fn, this.args);
      if (this.singleMode && Array.isArray(data)) {
        data = data[0] ?? null;
      }
      return { data, error: null, count: null, status: 200, statusText: "OK" };
    } catch (err) {
      return {
        data: null,
        error: toPostgrestError(err),
        count: null,
        status: 400,
        statusText: "Bad Request",
      };
    }
  }

  then<TResult1 = LocalResponse, TResult2 = never>(
    onfulfilled?: ((value: LocalResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

const bucketDir = (bucket: string) => (bucket === "media" ? MEDIA_DIR : `storage/${bucket}`);

const toBlob = (file: unknown): Blob => {
  if (file instanceof Blob) return file;
  if (file instanceof ArrayBuffer) return new Blob([file]);
  if (ArrayBuffer.isView(file)) {
    const view = file as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return new Blob([copy]);
  }
  if (typeof file === "string") return new Blob([file], { type: "text/plain" });
  throw new Error("نوع ملف غير مدعوم");
};

const storageError = (err: unknown) => ({
  message: err instanceof Error ? err.message : String(err),
  name: "StorageError",
});

export const createLocalClient = (getDb: () => FolderDb) => {
  const backendOrThrow = () => {
    const backend = getDb().getBackend();
    if (!backend) throw new Error("قاعدة البيانات غير مفتوحة");
    return backend;
  };

  const storageBucket = (bucket: string) => {
    const dir = bucketDir(bucket);
    const full = (path: string) => `${dir}/${path.replace(/^\/+/, "")}`;
    return {
      async upload(path: string, file: unknown, _options?: Record<string, unknown>) {
        try {
          await backendOrThrow().writeBlob(full(path), toBlob(file));
          return { data: { path, id: path, fullPath: `${bucket}/${path}` }, error: null };
        } catch (err) {
          return { data: null, error: storageError(err) };
        }
      },
      async update(path: string, file: unknown) {
        return this.upload(path, file);
      },
      async remove(paths: string[]) {
        try {
          const backend = backendOrThrow();
          for (const p of paths) await backend.remove(full(p));
          return { data: paths.map((name) => ({ name })), error: null };
        } catch (err) {
          return { data: null, error: storageError(err) };
        }
      },
      async download(path: string) {
        try {
          const blob = await backendOrThrow().readBlob(full(path));
          if (!blob) return { data: null, error: storageError(new Error("الملف غير موجود")) };
          return { data: blob, error: null };
        } catch (err) {
          return { data: null, error: storageError(err) };
        }
      },
      async createSignedUrl(path: string, _expiresIn?: number) {
        try {
          const url = await backendOrThrow().getDisplayUrl(full(path));
          if (!url) return { data: null, error: storageError(new Error("الملف غير موجود")) };
          return { data: { signedUrl: url }, error: null };
        } catch (err) {
          return { data: null, error: storageError(err) };
        }
      },
      async createSignedUrls(paths: string[], _expiresIn?: number) {
        try {
          const backend = backendOrThrow();
          const data: Array<{ path: string; signedUrl: string; error: string | null }> = [];
          for (const p of paths) {
            let signedUrl: string | null = null;
            let error: string | null = null;
            try {
              signedUrl = await backend.getDisplayUrl(full(p));
              if (!signedUrl) error = "الملف غير موجود في مجلد قاعدة البيانات";
            } catch (e) {
              error = e instanceof Error ? e.message : String(e);
            }
            data.push({ path: p, signedUrl: signedUrl ?? "", error });
          }
          return { data, error: null };
        } catch (err) {
          return { data: null, error: storageError(err) };
        }
      },
      async list(prefix = "") {
        try {
          const entries = await backendOrThrow().list(full(prefix || ""));
          return {
            data: entries.map((e) => ({
              name: e.name,
              id: e.kind === "file" ? e.name : null,
              metadata: e.kind === "file" ? { size: e.size ?? 0 } : null,
            })),
            error: null,
          };
        } catch (err) {
          return { data: null, error: storageError(err) };
        }
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: full(path) } };
      },
    };
  };

  const authListeners = new Set<(event: string, session: unknown) => void>();

  const auth = {
    async getSession() {
      return { data: { session: getLocalSession(getDb()) }, error: null };
    },
    async getUser() {
      return { data: { user: getLocalUser(getDb()) }, error: null };
    },
    onAuthStateChange(callback: (event: string, session: unknown) => void) {
      authListeners.add(callback);
      setTimeout(() => callback("INITIAL_SESSION", getLocalSession(getDb())), 0);
      return {
        data: {
          subscription: {
            id: "local",
            callback,
            unsubscribe: () => {
              authListeners.delete(callback);
            },
          },
        },
      };
    },
    async signInWithPassword() {
      const session = getLocalSession(getDb());
      return { data: { user: session.user, session }, error: null };
    },
    async signUp() {
      const session = getLocalSession(getDb());
      return { data: { user: session.user, session }, error: null };
    },
    async signOut() {
      return { error: null };
    },
    async updateUser(attrs: { data?: Record<string, unknown> } = {}) {
      const db = getDb();
      const name = attrs.data?.display_name;
      if (typeof name === "string" && db.isOpen()) {
        db.upsertRows("profiles", [{ id: LOCAL_USER_ID, display_name: name }], ["id"]);
      }
      const user = getLocalUser(db);
      for (const fn of authListeners) fn("USER_UPDATED", getLocalSession(db));
      return { data: { user }, error: null };
    },
  };

  return {
    from: (table: string) => new LocalQueryBuilder(getDb, table),
    rpc: (fn: string, args: Record<string, unknown> = {}) => new LocalRpcCall(getDb, fn, args),
    auth,
    storage: { from: storageBucket },
    channel: () => {
      const channel = {
        on: () => channel,
        subscribe: () => channel,
        unsubscribe: async () => "ok",
      };
      return channel;
    },
    removeChannel: async () => "ok",
  };
};

export type LocalClient = ReturnType<typeof createLocalClient>;
