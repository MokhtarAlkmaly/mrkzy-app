/**
 * المستخدمون والأدوار ومشاركة البيانات — خاصة بالنسخة السحابية.
 *
 * في النسخة التي تعمل بدون إنترنت يوجد مستخدم محلي واحد على الجهاز، فلا
 * إدارة مستخدمين ولا أذونات اطلاع. أُبقيت الدوال بنفس التوقيعات: القراءة
 * تعيد المستخدم المحلي، والعمليات الإدارية ترمي خطأً واضحاً.
 * الاسم الظاهر يُحفظ في جدول profiles داخل مجلد قاعدة البيانات.
 */

import { LOCAL_USER_EMAIL, LOCAL_USER_ID } from "@/offline/constants";
import { db } from "@/offline/dbManager";

export interface AppUser {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  is_admin: boolean;
  students_count: number;
  /** هل منحتُ هذا المستخدم إذن الاطلاع على بياناتي؟ */
  granted: boolean;
  access_level: "read" | "write" | null;
}

export interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
}

/** صاحب بيانات منحني إذن الاطلاع عليها. */
export interface SharedOwner {
  owner_id: string;
  name: string;
  email: string | null;
  access_level: "read" | "write";
}

const NOT_AVAILABLE = "إدارة المستخدمين غير متاحة في النسخة التي تعمل بدون إنترنت (مستخدم واحد).";

const localProfile = (): UserProfile => {
  const row = db.isOpen()
    ? db.rowsRef("profiles").find((p) => p.id === LOCAL_USER_ID)
    : undefined;
  return {
    id: LOCAL_USER_ID,
    email: (row?.email as string | null) ?? LOCAL_USER_EMAIL,
    display_name: (row?.display_name as string | null) ?? null,
    created_at: (row?.created_at as string) ?? new Date().toISOString(),
  };
};

/** لا يوجد مسؤول في النسخة المحلية. */
export const checkIsAdmin = async (): Promise<boolean> => false;

/** المستخدم الوحيد: المستخدم المحلي. */
export const listAllUsers = async (): Promise<AppUser[]> => {
  const profile = localProfile();
  return [
    {
      ...profile,
      is_admin: false,
      students_count: db.isOpen() ? db.rowsRef("students").length : 0,
      granted: false,
      access_level: null,
    },
  ];
};

export const grantAccess = async (
  _granteeId: string,
  _accessLevel: "read" | "write" = "read",
): Promise<void> => {
  throw new Error(NOT_AVAILABLE);
};

export const revokeAccess = async (_granteeId: string): Promise<void> => {
  throw new Error(NOT_AVAILABLE);
};

export const setUserRole = async (_userId: string, _makeAdmin: boolean): Promise<void> => {
  throw new Error(NOT_AVAILABLE);
};

export const deleteUser = async (_userId: string): Promise<void> => {
  throw new Error(NOT_AVAILABLE);
};

export const deleteUsers = async (_userIds: string[]): Promise<number> => {
  throw new Error(NOT_AVAILABLE);
};

/** لا مشاركة بيانات في النسخة المحلية. */
export const listSharedWithMe = async (): Promise<SharedOwner[]> => [];

/** الملف الشخصي المحلي. */
export const getMyProfile = async (): Promise<UserProfile | null> => localProfile();

/** تحديث الاسم الظاهر (يُحفظ في مجلد قاعدة البيانات). */
export const updateMyDisplayName = async (name: string): Promise<void> => {
  const trimmed = name.trim();
  db.upsertRows(
    "profiles",
    [{ id: LOCAL_USER_ID, display_name: trimmed, email: LOCAL_USER_EMAIL }],
    ["id"],
  );
  await db.flush();
};
