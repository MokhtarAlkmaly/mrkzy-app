/**
 * شاشة اختيار «مجلد قاعدة البيانات» — أول ما يظهر عند تشغيل النسخة التي
 * تعمل بدون إنترنت (أو عند تبديل المجلد).
 *
 * على أندرويد: نافذة النظام لاختيار مجلد في ذاكرة الهاتف أو بطاقة SD.
 * في المتصفح: مجلد على الحاسب (Chrome/Edge) أو التخزين الداخلي للمتصفح.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearch } from "@tanstack/react-router";
import {
  FolderOpen,
  HardDrive,
  WifiOff,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FolderSync,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import {
  db,
  describeBackendKind,
  ensureDbOpen,
  getLastOpenError,
  getReconnectableFolder,
  getStorageOptions,
  isNativeApp,
  pickAndOpen,
  readSavedConfig,
  reconnectSavedFolder,
  type SavedDbConfig,
} from "@/offline/dbManager";
import type { OpenResult } from "@/offline/folderDb";
import type { BackendKind } from "@/offline/backends/types";
import { SUGGESTED_FOLDER_NAME } from "@/offline/constants";
import { useDbStatus } from "@/offline/useDbStatus";

/** إلغاء المستخدم لنافذة الاختيار ليس خطأً يستحق رسالة. */
const isAbortError = (err: unknown) =>
  (err instanceof DOMException && err.name === "AbortError") ||
  (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "CANCELLED") ||
  (err instanceof Error && /cancel|abort|إلغاء/i.test(err.message));

const Setup = () => {
  const router = useRouter();
  const search = useSearch({ strict: false }) as { next?: string };
  const next =
    search.next && search.next.startsWith("/") && !search.next.startsWith("//") ? search.next : "/";
  const { toast } = useToast();
  const status = useDbStatus();

  const options = useMemo(() => getStorageOptions(), []);
  const [saved, setSaved] = useState<SavedDbConfig | null>(null);
  const [reconnectName, setReconnectName] = useState<string | null>(null);
  const [busy, setBusy] = useState<BackendKind | "saved" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSaved(readSavedConfig());
    void getReconnectableFolder().then(setReconnectName);
    const lastError = getLastOpenError();
    if (lastError) setError(lastError);
  }, []);

  const goNext = () => {
    router.history.push(next);
  };

  const finish = (result: OpenResult) => {
    const students = result.counts.students ?? 0;
    toast({
      title: result.isNew ? "تم إنشاء قاعدة بيانات جديدة" : "تم فتح قاعدة البيانات",
      description: result.isNew
        ? "المجلد جاهز — كل ما تضيفه يُحفظ فيه مباشرة."
        : `في المجلد ${students} طالب/طالبة. كل التعديلات تُحفظ فيه مباشرة.`,
    });
    goNext();
  };

  const handlePick = async (kind: BackendKind) => {
    setError(null);
    setBusy(kind);
    try {
      finish(await pickAndOpen(kind));
    } catch (err) {
      if (!isAbortError(err)) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleOpenSaved = async () => {
    setError(null);
    setBusy("saved");
    try {
      if (db.isOpen()) {
        goNext();
        return;
      }
      if (saved?.kind === "browser-folder" && reconnectName) {
        finish(await reconnectSavedFolder());
        return;
      }
      const ok = await ensureDbOpen();
      if (ok) {
        finish({ isNew: false, counts: db.counts(), warnings: db.status.warnings });
      } else {
        setError(
          getLastOpenError() ||
            "تعذّر فتح المجلد المحفوظ (ربما نُقل أو أُزيلت بطاقة الذاكرة أو سُحبت الصلاحية). اختر المجلد من جديد.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const native = isNativeApp();

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.55))] flex items-center justify-center p-4"
      dir="rtl"
    >
      <Card className="w-full max-w-xl rounded-[2rem] border-white/70 bg-card/90 p-6 sm:p-8 shadow-2xl shadow-primary/10 backdrop-blur space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-3xl bg-primary/5 p-3 ring-1 ring-primary/10">
            <img src={logo} alt="الشعار" className="h-20 w-auto" />
          </div>
          <h1 className="text-2xl font-black text-primary">مركز إنماء الأهلي الخيري</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
            <WifiOff className="h-3.5 w-3.5" />
            نسخة تعمل بدون إنترنت
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            قاعدة البيانات عبارة عن <b>مجلد</b> تختاره أنت
            {native ? " في ذاكرة الهاتف أو على بطاقة الذاكرة (SD)" : " على هذا الجهاز"}. كل جدول
            يُحفظ فيه كملف، ويمكنك نسخ المجلد احتياطياً أو نقله إلى جهاز آخر.
          </p>
        </div>

        {status.open && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
            <div className="flex items-center gap-2 text-sm text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              <span>
                قاعدة البيانات مفتوحة الآن من: <b dir="auto">{status.folderLabel}</b>
              </span>
            </div>
            <Button size="sm" onClick={goNext} className="shrink-0 rounded-xl">
              متابعة
            </Button>
          </div>
        )}

        {!status.open && saved && (
          <div className="space-y-3 rounded-2xl bg-primary/5 p-4 ring-1 ring-primary/15">
            <div className="flex items-start gap-2 text-sm">
              <FolderSync className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <div className="font-bold">المجلد المستخدم سابقاً</div>
                <div className="text-muted-foreground" dir="auto">
                  {saved.label} · {describeBackendKind(saved.kind)}
                </div>
              </div>
            </div>
            <Button
              onClick={handleOpenSaved}
              disabled={busy !== null}
              className="h-11 w-full gap-2 rounded-2xl"
            >
              {busy === "saved" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="h-4 w-4" />
              )}
              فتح هذا المجلد
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-black text-foreground">
            {saved || status.open ? "أو اختر مجلداً آخر" : "اختر مكان قاعدة البيانات"}
          </h2>
          {options.map((opt) => (
            <div
              key={opt.kind}
              className="rounded-2xl border bg-background/70 p-4 shadow-sm transition-colors hover:border-primary/40"
            >
              <div className="mb-3 flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                  {opt.kind === "android-saf" || opt.kind === "browser-folder" ? (
                    <FolderOpen className="h-5 w-5" />
                  ) : (
                    <HardDrive className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-bold">
                    {opt.title}
                    {opt.recommended && (
                      <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                        موصى به
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {opt.description}
                  </p>
                </div>
              </div>
              <Button
                variant={opt.recommended ? "default" : "outline"}
                onClick={() => handlePick(opt.kind)}
                disabled={busy !== null}
                className="h-11 w-full gap-2 rounded-2xl"
              >
                {busy === opt.kind ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : opt.kind === "android-saf" || opt.kind === "browser-folder" ? (
                  <FolderOpen className="h-4 w-4" />
                ) : (
                  <HardDrive className="h-4 w-4" />
                )}
                {opt.kind === "android-saf" || opt.kind === "browser-folder"
                  ? "اختيار المجلد"
                  : "استخدام التخزين الداخلي"}
              </Button>
            </div>
          ))}
        </div>

        {native && (
          <div className="flex gap-2 rounded-2xl bg-muted/60 p-4 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <b className="text-foreground">طريقة الاختيار:</b> في النافذة التي ستظهر افتح القائمة
              (☰) واختر <b>ذاكرة الهاتف</b> أو <b>بطاقة SD</b>، ثم أنشئ مجلداً جديداً باسم{" "}
              <b dir="ltr">{SUGGESTED_FOLDER_NAME}</b> (أو اختر مجلد قاعدة بيانات موجوداً مسبقاً)،
              واضغط «استخدام هذا المجلد» ثم «سماح». لا يمكن اختيار جذر الذاكرة أو مجلد التنزيلات
              مباشرة — اختر مجلداً بداخلها.
            </div>
          </div>
        )}

        {error && (
          <div className="flex gap-2 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span dir="auto">{error}</span>
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          البيانات لا تغادر جهازك — لا حسابات ولا خوادم ولا إنترنت.
        </div>
      </Card>
    </div>
  );
};

export default Setup;
