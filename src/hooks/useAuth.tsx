/**
 * «الحساب» في النسخة التي تعمل بدون إنترنت.
 *
 * لا يوجد تسجيل دخول ولا خادم: مستخدم محلي واحد ثابت يملك كل البيانات
 * المحفوظة في مجلد قاعدة البيانات. أُبقيت واجهة السياق نفسها (user/session/
 * isAdmin/...) حتى تبقى الشاشات القائمة تعمل كما هي.
 *
 * signOut هنا = «إغلاق قاعدة البيانات» والعودة إلى شاشة اختيار المجلد.
 */
import { createContext, useCallback, useContext, useMemo } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { SharedOwner } from "@/utils/users";
import type { ViewAsTarget } from "@/utils/viewAs";
import { getLocalSession, getLocalUser } from "@/offline/localClient";
import { closeDb, db } from "@/offline/dbManager";
import { useDbStatus } from "@/offline/useDbStatus";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** لا مسؤولين في النسخة المحلية (لا يوجد مستخدمون آخرون). */
  isAdmin: boolean;
  /** دائماً فارغة محلياً. */
  sharedWithMe: SharedOwner[];
  /** دائماً null محلياً. */
  viewAs: ViewAsTarget | null;
  setViewAs: (target: ViewAsTarget | null) => void;
  refreshAccess: () => Promise<void>;
  /** يحفظ ويغلق قاعدة البيانات ثم يعود لشاشة اختيار المجلد. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isAdmin: false,
  sharedWithMe: [],
  viewAs: null,
  setViewAs: () => {},
  refreshAccess: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  // يتحدّث عند فتح/إغلاق قاعدة البيانات (ولتحديث الاسم الظاهر).
  const status = useDbStatus();

  const signOut = useCallback(async () => {
    await closeDb(false);
    if (typeof window !== "undefined") window.location.assign("/setup");
  }, []);

  // ملاحظة: هوية الكائن user ثابتة طوال فتح قاعدة البيانات — كثير من الشاشات
  // تعيد تحميل بياناتها عند تغيّر user، فلا نغيّره مع كل عملية حفظ.
  const value = useMemo<AuthContextType>(() => {
    const session = status.open ? (getLocalSession(db) as unknown as Session) : null;
    const user = status.open ? (getLocalUser(db) as unknown as User) : null;
    return {
      session,
      user,
      loading: false,
      isAdmin: false,
      sharedWithMe: [],
      viewAs: null,
      setViewAs: () => {},
      refreshAccess: async () => {},
      signOut,
    };
  }, [status.open, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
