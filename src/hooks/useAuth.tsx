import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { checkIsAdmin, listSharedWithMe, type SharedOwner } from "@/utils/users";
import {
  getViewAs,
  setViewAs as persistViewAs,
  subscribeViewAs,
  type ViewAsTarget,
} from "@/utils/viewAs";

// ===== وضع استعادة كلمة المرور =====
//
// عند فتح رابط «نسيت كلمة المرور» تُنشئ Supabase جلسة مؤقتة، ثم تمسح رموز
// الرابط من العنوان، وبعدها تطلق الحدث PASSWORD_RECOVERY — وكل ذلك قد يحدث
// قبل تركيب صفحة الدخول. لذلك نلتقط الحالة هنا على مستوى الوحدة (تُحمَّل مع
// جذر التطبيق قبل اكتمال تهيئة Supabase)، ونحفظها للجلسة الحالية، حتى لا
// يُدخَل المستخدم مباشرة إلى النظام قبل أن يعيّن كلمة مرور جديدة.

const RECOVERY_FLAG_KEY = "mrkzy.passwordRecovery";

/** هل يحمل عنوان الصفحة رابط استعادة كلمة مرور (type=recovery)؟ */
export const urlRequestsPasswordRecovery = (): boolean => {
  if (typeof window === "undefined") return false;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return search.get("type") === "recovery" || hash.get("type") === "recovery";
};

const readStoredRecoveryFlag = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(RECOVERY_FLAG_KEY) === "1";
  } catch {
    return false;
  }
};

let passwordRecoveryPending = false;
const recoveryListeners = new Set<(pending: boolean) => void>();

const setPasswordRecoveryPending = (pending: boolean) => {
  passwordRecoveryPending = pending;
  if (typeof window !== "undefined") {
    try {
      if (pending) window.sessionStorage.setItem(RECOVERY_FLAG_KEY, "1");
      else window.sessionStorage.removeItem(RECOVERY_FLAG_KEY);
    } catch {
      /* التخزين غير متاح — الحالة في الذاكرة تكفي للجلسة الحالية */
    }
  }
  recoveryListeners.forEach((fn) => fn(pending));
};

if (typeof window !== "undefined") {
  if (readStoredRecoveryFlag() || urlRequestsPasswordRecovery()) {
    setPasswordRecoveryPending(true);
  }
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") setPasswordRecoveryPending(true);
    else if (event === "SIGNED_OUT") setPasswordRecoveryPending(false);
  });
}

/** هل ينتظر المستخدم تعيين كلمة مرور جديدة بعد فتح رابط الاستعادة؟ */
export const isPasswordRecoveryPending = () => passwordRecoveryPending;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** فُتح رابط استعادة كلمة المرور ولم تُعيَّن كلمة جديدة بعد. */
  passwordRecovery: boolean;
  /** يُنهي وضع الاستعادة بعد حفظ كلمة المرور الجديدة (أو إلغائه). */
  completePasswordRecovery: () => void;
  /** هل الحساب الحالي مسؤول؟ */
  isAdmin: boolean;
  /** الحسابات التي سمحت لي بالاطلاع على بياناتها. */
  sharedWithMe: SharedOwner[];
  /** الحساب الذي أطالع بياناته حالياً (قراءة فقط)، أو null. */
  viewAs: ViewAsTarget | null;
  /** تشغيل/إيقاف وضع الاطلاع. */
  setViewAs: (target: ViewAsTarget | null) => void;
  refreshAccess: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  passwordRecovery: false,
  completePasswordRecovery: () => {},
  isAdmin: false,
  sharedWithMe: [],
  viewAs: null,
  setViewAs: () => {},
  refreshAccess: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sharedWithMe, setSharedWithMe] = useState<SharedOwner[]>([]);
  const [viewAs, setViewAsState] = useState<ViewAsTarget | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  // مزامنة وضع استعادة كلمة المرور مع الحالة الملتقطة على مستوى الوحدة.
  useEffect(() => {
    setPasswordRecovery(isPasswordRecoveryPending());
    const listener = (pending: boolean) => setPasswordRecovery(pending);
    recoveryListeners.add(listener);
    return () => {
      recoveryListeners.delete(listener);
    };
  }, []);

  const completePasswordRecovery = useCallback(() => {
    setPasswordRecoveryPending(false);
  }, []);

  // مزامنة حالة العرض مع المخزن المشترك الذي تقرأه طبقة التخزين.
  useEffect(() => {
    setViewAsState(getViewAs());
    return subscribeViewAs((target) => setViewAsState(target));
  }, []);

  const setViewAs = useCallback((target: ViewAsTarget | null) => {
    persistViewAs(target);
  }, []);

  const loadAccess = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setIsAdmin(false);
      setSharedWithMe([]);
      return;
    }
    const [admin, shared] = await Promise.all([
      checkIsAdmin().catch(() => false),
      listSharedWithMe().catch(() => [] as SharedOwner[]),
    ]);
    setIsAdmin(admin);
    setSharedWithMe(shared);

    // إن سُحب الإذن أثناء الاطلاع، نُخرج المستخدم من وضع العرض فوراً.
    const active = getViewAs();
    if (active && !admin && !shared.some((s) => s.owner_id === active.id)) {
      persistViewAs(null);
    }
  }, []);

  useEffect(() => {
    const applySession = (nextSession: Session | null) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      void loadAccess(nextSession?.user ?? null);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // الخروج من وضع الاطلاع عند تسجيل الخروج أو تبديل الحساب.
      if (event === "SIGNED_OUT") persistViewAs(null);
      applySession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
    });

    return () => subscription.unsubscribe();
  }, [loadAccess]);

  const refreshAccess = useCallback(async () => {
    await loadAccess(user);
  }, [loadAccess, user]);

  const signOut = async () => {
    persistViewAs(null);
    setPasswordRecoveryPending(false);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setSharedWithMe([]);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        passwordRecovery,
        completePasswordRecovery,
        isAdmin,
        sharedWithMe,
        viewAs,
        setViewAs,
        refreshAccess,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
