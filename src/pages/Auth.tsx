import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth, isPasswordRecoveryPending } from "@/hooks/useAuth";
import { getAuthEmailRedirect } from "@/utils/authRedirect";
import { LogoBadge } from "@/components/LogoBadge";
import {
  AlertTriangle,
  CloudUpload,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";

/** مفتاح حفظ آخر بريد استُخدم لتسجيل الدخول على هذا الجهاز. */
const LAST_EMAIL_KEY = "mrkzy.lastEmail";
const MIN_PASSWORD_LENGTH = 6;

type Mode = "login" | "signup" | "recovery";

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const readLastEmail = (): string | null => {
  try {
    return window.localStorage.getItem(LAST_EMAIL_KEY);
  } catch {
    return null;
  }
};

const saveLastEmail = (value: string) => {
  try {
    window.localStorage.setItem(LAST_EMAIL_KEY, value);
  } catch {
    /* التخزين المحلي غير متاح */
  }
};

const forgetLastEmail = () => {
  try {
    window.localStorage.removeItem(LAST_EMAIL_KEY);
  } catch {
    /* تجاهل */
  }
};

/** ترجمة أخطاء Supabase الشائعة إلى رسائل عربية واضحة. */
const translateAuthError = (error: unknown): string => {
  const { message = "", code = "" } = (error ?? {}) as { message?: string; code?: string };
  const text = `${code} ${message}`.toLowerCase();

  if (text.includes("invalid_credentials") || text.includes("invalid login credentials"))
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  if (text.includes("email_not_confirmed") || text.includes("email not confirmed"))
    return "لم يُؤكَّد البريد الإلكتروني بعد — افتح رسالة التأكيد في بريدك ثم سجّل الدخول.";
  if (text.includes("user_already_exists") || text.includes("already registered"))
    return "هذا البريد مسجّل مسبقاً — سجّل دخولك أو استعد كلمة المرور.";
  if (text.includes("same_password") || text.includes("different from the old password"))
    return "كلمة المرور الجديدة يجب أن تختلف عن كلمة المرور الحالية.";
  if (text.includes("weak_password") || text.includes("at least 6 characters"))
    return `كلمة المرور ضعيفة — اكتب ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`;
  if (
    text.includes("rate_limit") ||
    text.includes("rate limit") ||
    text.includes("security purposes")
  )
    return "طلبات كثيرة متتالية — انتظر قليلاً ثم حاول مرة أخرى.";
  if (text.includes("signup_disabled") || text.includes("signups not allowed"))
    return "إنشاء الحسابات معطّل حالياً — تواصل مع مسؤول النظام.";
  if (text.includes("email_address_invalid") || text.includes("invalid format"))
    return "صيغة البريد الإلكتروني غير صحيحة.";
  if (text.includes("session_not_found") || text.includes("auth session missing"))
    return "انتهت جلسة الاستعادة — اطلب رابط استعادة جديداً.";
  if (text.includes("failed to fetch") || text.includes("network"))
    return "تعذّر الاتصال بالخادم — تحقق من اتصال الإنترنت ثم حاول مجدداً.";
  return message || "حدث خطأ غير متوقع.";
};

/**
 * خطأ قادم من رابط بريد Supabase (مثل رابط استعادة منتهي الصلاحية):
 * يصل في العنوان على شكل `#error=...&error_code=...&error_description=...`.
 */
const readLinkError = (): string | null => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  const code = hash.get("error_code") || search.get("error_code");
  const description = hash.get("error_description") || search.get("error_description");
  if (!code && !description) return null;
  if (code === "otp_expired" || /expired|invalid/i.test(description || "")) {
    return "رابط البريد غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً من «نسيت كلمة المرور؟».";
  }
  return description
    ? `تعذّر إكمال العملية من رابط البريد: ${description}`
    : "رابط البريد غير صالح.";
};

const Auth = () => {
  const { user, passwordRecovery, completePasswordRecovery, signOut } = useAuth();
  const { toast } = useToast();

  // معاملات رابط الدعوة من صفحة المستخدمين: /auth?mode=signup&email=...&name=...
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isInvite = initialParams.get("mode") === "signup";

  const [mode, setMode] = useState<Mode>(() =>
    passwordRecovery || isPasswordRecoveryPending() ? "recovery" : isInvite ? "signup" : "login",
  );
  const [email, setEmail] = useState(() => initialParams.get("email") || "");
  const [displayName, setDisplayName] = useState(() => initialParams.get("name") || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  /** البريد محفوظ من مرة سابقة: نعرضه ثابتاً ونطلب كلمة المرور فقط. */
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(() =>
    isInvite ? null : readLastEmail(),
  );

  const isRecovery = mode === "recovery";
  const isLogin = mode === "login";
  // رابط استعادة بلا جلسة صالحة (منتهي أو فشل التحقق منه).
  const recoveryWithoutSession = isRecovery && !user;
  // نعرض البريد ثابتاً فقط في وضع تسجيل الدخول وعند وجود بريد محفوظ.
  const showRemembered = isLogin && !!rememberedEmail;
  /** البريد المعتمد: المحفوظ عند عرضه ثابتاً، وإلا المكتوب في الحقل. */
  const currentEmail = showRemembered ? (rememberedEmail ?? "") : email;

  // خطأ قادم من رابط البريد (رابط منتهي أو مستخدم): نعرضه ثم ننظّف العنوان.
  useEffect(() => {
    const error = readLinkError();
    if (!error) return;
    setLinkError(error);
    // إزالة معاملات الخطأ من العنوان حتى لا يتكرر التنبيه عند التحديث.
    const url = new URL(window.location.href);
    ["error", "error_code", "error_description"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  }, []);

  // فتح رابط الاستعادة أثناء عرض الصفحة: ننتقل لنموذج كلمة المرور الجديدة.
  useEffect(() => {
    if (!passwordRecovery) return;
    setMode("recovery");
    setPassword("");
    setConfirmPassword("");
  }, [passwordRecovery]);

  const resetPasswords = () => {
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetPasswords();
    setLinkError(null);
  };

  /** نسيان البريد المحفوظ للدخول بحساب آخر. */
  const useAnotherAccount = () => {
    forgetLastEmail();
    setRememberedEmail(null);
    setEmail("");
    resetPasswords();
  };

  const handleCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState?.("CapsLock") ?? false);
  };

  // النسخة الأوفلاين: كل الحسابات محلية على الجهاز، فلا عملية تحتاج إنترنت.
  const requireOnline = () => true;

  const handleLogin = async () => {
    const normalizedEmail = normalizeEmail(currentEmail);
    if (!normalizedEmail) throw new Error("يرجى إدخال البريد الإلكتروني.");
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) throw error;
    // نحفظ البريد بعد نجاح الدخول فقط.
    saveLastEmail(normalizedEmail);
    toast({ title: "تم تسجيل الدخول بنجاح", description: "مرحباً بك!" });
  };

  const handleSignup = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error("يرجى إدخال البريد الإلكتروني.");
    const newPassword = password.trim();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`);
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: newPassword,
      options: {
        emailRedirectTo: getAuthEmailRedirect(),
        // يُقرأ في trigger قاعدة البيانات handle_new_user لملء الاسم في profiles.
        data: { display_name: displayName.trim() || normalizedEmail.split("@")[0] },
      },
    });
    if (error) throw error;

    // Supabase لا تُرجع خطأ لبريد مسجَّل مسبقاً (حمايةً من كشف الحسابات)،
    // لكنها تُرجع مستخدماً بلا هويات — نعتبره بريداً مسجَّلاً.
    if (data.user && data.user.identities?.length === 0) {
      throw new Error("هذا البريد مسجّل مسبقاً — سجّل دخولك أو استعد كلمة المرور.");
    }

    saveLastEmail(normalizedEmail);
    if (data.session) {
      // تأكيد البريد غير مفعّل: الحساب جاهز ويُحوَّل المستخدم تلقائياً.
      toast({ title: "تم إنشاء الحساب", description: "مرحباً بك في النظام!" });
      return;
    }

    toast({
      title: "تم إنشاء الحساب",
      description: "افتح رسالة التأكيد المرسلة إلى بريدك، ثم سجّل الدخول.",
    });
    setRememberedEmail(normalizedEmail);
    setEmail(normalizedEmail);
    switchMode("login");
  };

  const handlePasswordRecovery = async () => {
    const newPassword = password.trim();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`);
    }
    if (newPassword !== confirmPassword.trim()) {
      throw new Error("كلمتا المرور غير متطابقتين — اكتب الكلمة نفسها في خانة التأكيد.");
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;

    if (user?.email) saveLastEmail(normalizeEmail(user.email));
    toast({
      title: "تم تحديث كلمة المرور",
      description: "يمكنك الآن متابعة استخدام النظام بكلمة المرور الجديدة.",
    });
    // إنهاء وضع الاستعادة يسمح لمسار /auth بالتحويل إلى الوجهة المطلوبة.
    completePasswordRecovery();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requireOnline()) return;
    setLoading(true);
    try {
      if (mode === "recovery") await handlePasswordRecovery();
      else if (mode === "login") await handleLogin();
      else await handleSignup();
    } catch (error: unknown) {
      toast({ title: "خطأ", description: translateAuthError(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const normalizedEmail = normalizeEmail(currentEmail);
    if (!normalizedEmail) {
      toast({
        title: "اكتب البريد أولاً",
        description: "أدخل بريدك الإلكتروني ثم اضغط «نسيت كلمة المرور؟».",
        variant: "destructive",
      });
      return;
    }
    if (!requireOnline()) return;

    setResetLoading(true);
    try {
      // أوفلاين: لا بريد — إعادة التعيين بيد مسؤول الجهاز من «إدارة المستخدمين»
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: getAuthEmailRedirect(),
      });
      if (error) throw error;
      setLinkError(null);
      toast({
        title: "تم إرسال رابط الاستعادة",
        description: `افتح بريدك (${normalizedEmail}) واتبع الرابط لتعيين كلمة مرور جديدة.`,
      });
    } catch (error: unknown) {
      toast({
        title: "تعذّر إرسال رابط الاستعادة",
        description: translateAuthError(error),
        variant: "destructive",
      });
    } finally {
      setResetLoading(false);
    }
  };

  /** إلغاء الاستعادة: إنهاء الجلسة المؤقتة والعودة لتسجيل الدخول العادي. */
  const cancelRecovery = async () => {
    // الخروج أولاً (وهو يُنهي وضع الاستعادة بنفسه)، حتى لا يُحوَّل المستخدم
    // إلى النظام بالجلسة المؤقتة قبل اكتمال الخروج.
    if (user) await signOut();
    else completePasswordRecovery();
    switchMode("login");
  };

  const title = isRecovery ? "تعيين كلمة مرور جديدة" : isLogin ? "تسجيل الدخول" : "إنشاء حساب جديد";
  const description = isRecovery
    ? user?.email
      ? `اكتب كلمة مرور جديدة للحساب ${user.email} ثم احفظها.`
      : "اكتب كلمة مرور جديدة لحسابك ثم احفظها."
    : isLogin
      ? "سجّل دخولك للوصول إلى أقسام المركز وإدارة بياناتها."
      : isInvite
        ? "تمت دعوتك للانضمام إلى النظام — أكمل بياناتك لإنشاء حسابك."
        : "املأ بياناتك لإنشاء حساب جديد، ثم سجّل الدخول.";

  const features = [
    { icon: ShieldCheck, text: "بيانات كل حساب معزولة ومحمية" },
    { icon: CloudUpload, text: "يعمل دون اتصال ويُزامن مع السحابة تلقائياً" },
    { icon: Mail, text: "تذكّر آخر بريد لتسجيل دخول أسرع" },
    { icon: UsersRound, text: "إدارة مستخدمين وصلاحيات للمسؤول" },
  ];

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.2),transparent_34rem),radial-gradient(circle_at_bottom_left,hsl(var(--accent)/0.35),transparent_28rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.55))] p-4"
      dir="rtl"
    >
      <Card className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border-white/70 bg-card/95 shadow-2xl shadow-primary/10 backdrop-blur md:grid-cols-[0.95fr_1.05fr]">
        {/* اللوحة التعريفية (الشاشات المتوسطة فما فوق) */}
        <div className="relative hidden min-h-[36rem] flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-emerald-700 to-teal-950 p-8 text-primary-foreground md:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.22),transparent_12rem),radial-gradient(circle_at_80%_75%,rgba(251,191,36,.18),transparent_10rem)]" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-amber-200 ring-1 ring-white/15">
              <Sparkles className="h-3.5 w-3.5" />
              مركز إنماء الأهلي الخيري
            </div>
            <h2 className="mt-5 text-3xl font-black leading-relaxed text-white">
              دخول آمن، صلاحيات واضحة، وبيانات محفوظة لكل مستخدم.
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-7 text-white/75">
              قسم القرآن الكريم (الطلاب، الحلقات، المتابعة الشهرية، والمسابقات) وقسم التدريب
              والتأهيل — في نظام واحد يعمل على الويب والجوال.
            </p>
          </div>

          <ul className="relative z-10 grid gap-3">
            {features.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-center gap-2 rounded-2xl bg-white/10 p-3 text-sm ring-1 ring-white/15"
              >
                <Icon className="h-4 w-4 shrink-0 text-amber-300" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* نموذج الدخول */}
        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <LogoBadge size="xl" goldRing alt="شعار مركز إنماء الأهلي الخيري" />
            <div>
              <h1 className="text-xl font-black text-primary sm:text-2xl">
                مركز إنماء الأهلي الخيري
              </h1>
              <p className="mt-1 text-base font-bold text-foreground">{title}</p>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>

          {linkError && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-6 text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{linkError}</span>
              <button
                type="button"
                onClick={() => setLinkError(null)}
                className="rounded-full p-0.5 transition-colors hover:bg-destructive/10"
                aria-label="إغلاق التنبيه"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {recoveryWithoutSession ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-7 text-amber-900 dark:text-amber-100">
                <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />
                <span>
                  تعذّر التحقق من رابط الاستعادة — قد يكون منتهي الصلاحية أو استُخدم من قبل. ارجع
                  لتسجيل الدخول واطلب رابطاً جديداً من «نسيت كلمة المرور؟».
                </span>
              </div>
              <Button
                type="button"
                className="h-12 w-full gap-2 rounded-2xl"
                onClick={() => void cancelRecovery()}
              >
                <LogIn className="h-4 w-4" /> العودة لتسجيل الدخول
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {!isRecovery &&
                (showRemembered ? (
                  // البريد محفوظ: يظهر مكتوباً ولا يُطلب إدخاله مجدداً.
                  <div className="flex items-center justify-between gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate text-sm font-semibold" dir="ltr">
                        {rememberedEmail}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={useAnotherAccount}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      title="الدخول بحساب آخر"
                    >
                      <X className="h-3 w-3" /> تغيير
                    </button>
                  </div>
                ) : (
                  <>
                    {mode === "signup" && (
                      <div className="relative">
                        <User className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="الاسم الكامل"
                          aria-label="الاسم الكامل"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="h-12 rounded-2xl pr-10"
                          autoComplete="name"
                        />
                      </div>
                    )}
                    <div className="relative">
                      <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="البريد الإلكتروني"
                        aria-label="البريد الإلكتروني"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-12 rounded-2xl pr-10"
                        required
                        dir="ltr"
                        autoComplete={isLogin ? "username" : "email"}
                        inputMode="email"
                      />
                    </div>
                  </>
                ))}

              <div className="space-y-1.5">
                <div className="relative">
                  {isRecovery ? (
                    <KeyRound className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  ) : (
                    <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  )}
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={isRecovery ? "كلمة المرور الجديدة" : "كلمة المرور"}
                    aria-label={isRecovery ? "كلمة المرور الجديدة" : "كلمة المرور"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={handleCapsLock}
                    onKeyDown={handleCapsLock}
                    className="h-12 rounded-2xl pl-10 pr-10"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    dir="ltr"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    autoFocus={showRemembered || isRecovery}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-primary"
                    aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    title={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {!isLogin && (
                  <p className="px-2 text-[11px] text-muted-foreground">
                    {MIN_PASSWORD_LENGTH} أحرف على الأقل.
                  </p>
                )}
              </div>

              {isRecovery && (
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="تأكيد كلمة المرور الجديدة"
                    aria-label="تأكيد كلمة المرور الجديدة"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyUp={handleCapsLock}
                    className="h-12 rounded-2xl pr-10"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    dir="ltr"
                    autoComplete="new-password"
                  />
                </div>
              )}

              {capsLock && (
                <p className="flex items-center gap-1.5 px-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> زر الأحرف الكبيرة (Caps Lock) مفعّل.
                </p>
              )}

              {isLogin && (
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => void handleResetPassword()}
                    disabled={resetLoading}
                    className="rounded-full px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resetLoading ? "جارٍ إرسال الرابط..." : "نسيت كلمة المرور؟"}
                  </button>
                </div>
              )}

              <Button
                type="submit"
                className="h-12 w-full gap-2 rounded-2xl shadow-lg shadow-primary/20"
                disabled={loading}
              >
                {isRecovery ? (
                  <KeyRound className="h-4 w-4" />
                ) : isLogin ? (
                  <LogIn className="h-4 w-4" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {loading
                  ? "جارٍ المعالجة..."
                  : isRecovery
                    ? "حفظ كلمة المرور الجديدة"
                    : isLogin
                      ? "تسجيل الدخول"
                      : "إنشاء حساب"}
              </Button>

              {isRecovery && (
                <button
                  type="button"
                  onClick={() => void cancelRecovery()}
                  className="w-full rounded-full px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  إلغاء والعودة لتسجيل الدخول
                </button>
              )}
            </form>
          )}

          {!isRecovery && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => switchMode(isLogin ? "signup" : "login")}
                className="rounded-full px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/10"
              >
                {isLogin ? "ليس لديك حساب؟ أنشئ واحداً" : "لديك حساب؟ سجّل دخولك"}
              </button>
            </div>
          )}

          <div className="mt-5 rounded-2xl bg-muted/60 p-3 text-xs leading-6 text-muted-foreground">
            <strong className="text-foreground">تنبيه:</strong> لا تشارك كلمة مرورك مع أحد. يدير
            المسؤول الصلاحيات من صفحة المستخدمين دون الحاجة لمعرفة كلمات مرور الحسابات.
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Auth;
