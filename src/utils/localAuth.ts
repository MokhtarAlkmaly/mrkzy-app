/**
 * المستخدمون المحليون — بديل حسابات Supabase في النسخة الأوفلاين.
 *
 * - المستخدمون أنفسهم صفوف في جدول `local_users.json` داخل مجلد القاعدة،
 *   وكلمات المرور محفوظة كتجزئة SHA-256 مع ملح عشوائي لكل مستخدم
 *   (لا تُحفظ كلمة المرور نفسها أبداً).
 * - أول مستخدم يُنشأ على الجهاز يصبح «مسؤولاً» تلقائياً، والمسؤول يدير
 *   بقية المستخدمين من صفحة «إدارة المستخدمين» (ترقية/حذف/إعادة تعيين
 *   كلمة المرور) — كل ذلك محلياً على الجهاز نفسه.
 * - الجلسة الحالية تُحفظ في localStorage (معرّف المستخدم فقط)، فلا حاجة
 *   لتسجيل الدخول كل مرة.
 */

import { folderDB, type DbRow } from "./folderDB";

export interface LocalUser {
  id: string;
  email: string; // اسم الدخول (بريد أو اسم مستخدم)
  display_name: string | null;
  is_admin: boolean;
  created_at: string;
}

interface StoredUser extends LocalUser {
  password_hash: string;
  salt: string;
}

const SESSION_KEY = "mrkzy-local-session";

const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const randomHex = (bytes: number): string => {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const hashPassword = async (password: string, salt: string): Promise<string> => {
  const input = `${salt}:${password}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    return toHex(await crypto.subtle.digest("SHA-256", data));
  }
  // احتياط لبيئات غير آمنة (تطوير ويب فقط): تجزئة بسيطة حتى لا يتعطل الدخول
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return `fallback$${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
};

const allUsers = async (): Promise<StoredUser[]> =>
  (await folderDB.getAll("local_users")) as unknown as StoredUser[];

const publicUser = (u: StoredUser): LocalUser => ({
  id: u.id,
  email: u.email,
  display_name: u.display_name ?? null,
  is_admin: !!u.is_admin,
  created_at: u.created_at,
});

/** هل يوجد أي مستخدم على هذا الجهاز؟ (false = أول تشغيل) */
export const hasAnyLocalUser = async (): Promise<boolean> => (await allUsers()).length > 0;

export const listLocalUsers = async (): Promise<LocalUser[]> => (await allUsers()).map(publicUser);

/** إنشاء مستخدم محلي جديد. أول مستخدم يصبح مسؤولاً. */
export const createLocalUser = async (input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<LocalUser> => {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("أدخل اسم الدخول (البريد أو اسم المستخدم)");
  if (!input.password || input.password.length < 6)
    throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");

  const users = await allUsers();
  if (users.some((u) => u.email.toLowerCase() === email))
    throw new Error("يوجد حساب بهذا الاسم على هذا الجهاز مسبقاً");

  const salt = randomHex(16);
  const user: StoredUser = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `local-${Date.now().toString(36)}-${randomHex(6)}`,
    email,
    display_name: input.displayName?.trim() || null,
    is_admin: users.length === 0,
    created_at: new Date().toISOString(),
    password_hash: await hashPassword(input.password, salt),
    salt,
  };
  await folderDB.upsert("local_users", user as unknown as DbRow);

  // ملف تعريف موازٍ (تقرأه صفحة المستخدمين والقوائم كما كانت تقرأ profiles)
  await folderDB.upsert("profiles", {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    created_at: user.created_at,
  });
  if (user.is_admin) {
    await folderDB.upsert("user_roles", {
      id: `${user.id}-admin`,
      user_id: user.id,
      role: "admin",
      created_at: user.created_at,
    });
  }
  return publicUser(user);
};

/** التحقق من بيانات الدخول. يعيد المستخدم أو null. */
export const verifyLocalCredentials = async (
  email: string,
  password: string,
): Promise<LocalUser | null> => {
  const normalized = email.trim().toLowerCase();
  const user = (await allUsers()).find((u) => u.email.toLowerCase() === normalized);
  if (!user) return null;
  const hash = await hashPassword(password, user.salt);
  return hash === user.password_hash ? publicUser(user) : null;
};

export const getLocalUserById = async (id: string): Promise<LocalUser | null> => {
  const user = (await allUsers()).find((u) => u.id === id);
  return user ? publicUser(user) : null;
};

/** تحديث بيانات مستخدم (الاسم الظاهر / الصلاحية / كلمة مرور جديدة). */
export const updateLocalUser = async (
  id: string,
  patch: { display_name?: string | null; is_admin?: boolean; newPassword?: string },
): Promise<void> => {
  const users = await allUsers();
  const user = users.find((u) => u.id === id);
  if (!user) throw new Error("المستخدم غير موجود");
  const next: StoredUser = { ...user };
  if (patch.display_name !== undefined) next.display_name = patch.display_name;
  if (patch.is_admin !== undefined) next.is_admin = patch.is_admin;
  if (patch.newPassword) {
    if (patch.newPassword.length < 6) throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    next.salt = randomHex(16);
    next.password_hash = await hashPassword(patch.newPassword, next.salt);
  }
  await folderDB.upsert("local_users", next as unknown as DbRow);
  await folderDB.upsert("profiles", {
    id: next.id,
    email: next.email,
    display_name: next.display_name,
    created_at: next.created_at,
  });
  if (next.is_admin) {
    await folderDB.upsert("user_roles", {
      id: `${next.id}-admin`,
      user_id: next.id,
      role: "admin",
      created_at: next.created_at,
    });
  } else {
    await folderDB.deleteWhere("user_roles", (r) => r.user_id === next.id && r.role === "admin");
  }
};

/** حذف مستخدم محلي وملفه (بياناته التشغيلية تبقى لصاحبها المسؤول إن أراد تنظيفها). */
export const deleteLocalUser = async (id: string): Promise<void> => {
  await folderDB.deleteWhere("local_users", (r) => r.id === id);
  await folderDB.deleteWhere("profiles", (r) => r.id === id);
  await folderDB.deleteWhere("user_roles", (r) => r.user_id === id);
  await folderDB.deleteWhere("data_access_grants", (r) => r.owner_id === id || r.grantee_id === id);
};

// ===================== الجلسة المحلية =====================

export const saveLocalSession = (userId: string) => {
  try {
    window.localStorage.setItem(SESSION_KEY, userId);
  } catch {
    /* تجاهل */
  }
};

export const clearLocalSession = () => {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* تجاهل */
  }
};

export const readLocalSessionUserId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};
