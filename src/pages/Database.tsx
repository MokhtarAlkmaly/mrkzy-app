/**
 * شاشة «قاعدة البيانات» — إدارة مجلد قاعدة البيانات المحلية:
 * المجلد الحالي وحالة الحفظ، محتوى الجداول، النسخ الاحتياطية (داخل المجلد
 * وكملف)، الاستعادة، ونقل البيانات من النسخة السحابية لمرة واحدة.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Database as DatabaseIcon,
  FolderOpen,
  Save,
  RefreshCw,
  FolderSync,
  Archive,
  Download,
  Upload,
  CloudDownload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  History,
  LogOut,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@/lib/router-compat";
import { db, describeBackendKind, isNativeApp } from "@/offline/dbManager";
import { useDbStatus } from "@/offline/useDbStatus";
import { TABLES } from "@/offline/schema";
import type { BackupSnapshot } from "@/offline/folderDb";
import {
  createFolderBackup,
  exportBackupFile,
  listFolderBackups,
  parseBackupFileText,
  readFolderBackup,
  restoreSnapshot,
  summarizeSnapshot,
  type FolderBackupInfo,
} from "@/offline/backup";
import { BACKUPS_DIR, MAX_DAILY_BACKUPS, MEDIA_DIR } from "@/offline/constants";

const formatTime = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleTimeString("ar", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

const formatSize = (bytes?: number) => {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const BACKUP_KIND_LABEL: Record<FolderBackupInfo["kind"], string> = {
  daily: "يومية تلقائية",
  manual: "يدوية",
  safety: "نسخة أمان قبل استعادة/نقل",
  other: "أخرى",
};

interface PendingRestore {
  title: string;
  snapshot: BackupSnapshot;
}

const Database = () => {
  const status = useDbStatus();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [backups, setBackups] = useState<FolderBackupInfo[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // نقل البيانات من النسخة السحابية
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [cloudMedia, setCloudMedia] = useState(true);
  const [cloudAdvanced, setCloudAdvanced] = useState(false);
  const [cloudUrl, setCloudUrl] = useState("");
  const [cloudKey, setCloudKey] = useState("");
  const [cloudConfirm, setCloudConfirm] = useState(false);
  const [cloudProgress, setCloudProgress] = useState<{
    current: number;
    total: number;
    label: string;
  } | null>(null);
  const [cloudResult, setCloudResult] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const refreshCounts = useCallback(() => {
    if (db.isOpen()) setCounts(db.counts());
  }, []);

  const refreshBackups = useCallback(async () => {
    if (!db.isOpen()) return;
    setLoadingBackups(true);
    try {
      setBackups(await listFolderBackups());
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBackups(false);
    }
  }, []);

  useEffect(() => {
    refreshCounts();
    void refreshBackups();
    const off = db.onChange(() => refreshCounts());
    return off;
  }, [refreshCounts, refreshBackups]);

  useEffect(() => {
    void import("@/offline/cloudImport").then((m) => {
      setCloudUrl(m.DEFAULT_CLOUD_URL);
      setCloudKey(m.DEFAULT_CLOUD_KEY);
    });
  }, []);

  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast({
        title: "تعذّرت العملية",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleSaveNow = () =>
    run("save", async () => {
      await db.flush();
      toast({ title: "تم الحفظ في المجلد", description: status.folderLabel });
    });

  const handleReload = () =>
    run("reload", async () => {
      await db.reload();
      refreshCounts();
      await refreshBackups();
      toast({ title: "أُعيدت قراءة البيانات من المجلد" });
    });

  const handleBackupNow = () =>
    run("backup", async () => {
      const name = await createFolderBackup();
      await refreshBackups();
      toast({ title: "تم إنشاء نسخة احتياطية", description: `${BACKUPS_DIR}/${name}` });
    });

  const handleExport = () =>
    run("export", async () => {
      const name = await exportBackupFile();
      toast({
        title: "تم تصدير النسخة الاحتياطية",
        description: isNativeApp() ? "اختر مكان حفظها أو التطبيق الذي تريد مشاركتها معه." : name,
      });
    });

  const askRestoreFromFolder = (info: FolderBackupInfo) =>
    run(`read-${info.name}`, async () => {
      const snapshot = await readFolderBackup(info.name);
      setPendingRestore({ title: info.name, snapshot });
    });

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await run("import", async () => {
      const text = await file.text();
      const snapshot = parseBackupFileText(text);
      setPendingRestore({ title: file.name, snapshot });
    });
  };

  const confirmRestore = () => {
    const pending = pendingRestore;
    setPendingRestore(null);
    if (!pending) return;
    void run("restore", async () => {
      const safety = await restoreSnapshot(pending.snapshot);
      refreshCounts();
      await refreshBackups();
      toast({
        title: "تمت الاستعادة",
        description: safety
          ? `حُفظت البيانات السابقة في ${BACKUPS_DIR}/${safety}`
          : "تم استبدال البيانات بمحتوى النسخة الاحتياطية.",
      });
    });
  };

  const startCloudImport = async () => {
    setCloudConfirm(false);
    setCloudError(null);
    setCloudResult(null);
    setBusy("cloud");
    setCloudProgress({ current: 0, total: 1, label: "بدء النقل" });
    try {
      const { importFromCloud } = await import("@/offline/cloudImport");
      const result = await importFromCloud({
        url: cloudUrl,
        key: cloudKey,
        email: cloudEmail,
        password: cloudPassword,
        includeMedia: cloudMedia,
        onProgress: (current, totalSteps, label) =>
          setCloudProgress({ current, total: totalSteps, label }),
      });
      refreshCounts();
      await refreshBackups();
      setCloudPassword("");
      const students = result.counts.students ?? 0;
      const media = cloudMedia
        ? ` — الوسائط: ${result.mediaCopied} ملف${result.mediaFailed ? ` (تعذّر ${result.mediaFailed})` : ""}`
        : "";
      setCloudResult(`تم نقل ${students} طالب/طالبة وكل الجداول الأخرى إلى المجلد${media}.`);
      toast({ title: "اكتمل نقل البيانات", description: "يمكنك الآن العمل بدون إنترنت." });
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : String(err));
    } finally {
      setCloudProgress(null);
      setBusy(null);
    }
  };

  const restoreSummary = pendingRestore ? summarizeSnapshot(pendingRestore.snapshot) : null;

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.45))] pb-10"
      dir="rtl"
    >
      <header className="mx-3 mt-3 rounded-[2rem] bg-gradient-to-br from-primary via-emerald-700 to-teal-950 px-4 py-6 text-primary-foreground shadow-2xl shadow-primary/20">
        <div className="container mx-auto max-w-5xl">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/15 p-3 ring-1 ring-white/20">
              <DatabaseIcon className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black">قاعدة البيانات</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-white/80">
                <WifiOff className="h-4 w-4" />
                كل البيانات محفوظة في مجلد على جهازك — بدون إنترنت.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-5xl space-y-4 px-3 py-5 sm:px-4">
        {/* المجلد الحالي */}
        <Card className="space-y-4 rounded-3xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <FolderOpen className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-muted-foreground">المجلد الحالي</div>
                <div className="text-lg font-black break-all" dir="auto">
                  {status.folderLabel || "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {describeBackendKind(status.backendKind)}
                </div>
              </div>
            </div>
            <div className="text-sm">
              {status.lastError ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 font-bold text-destructive">
                  <AlertTriangle className="h-4 w-4" /> تعذّر الحفظ
                </span>
              ) : status.saving || status.dirtyTables > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-800">
                  <Loader2 className="h-4 w-4 animate-spin" /> جارٍ الحفظ…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" /> محفوظ
                  {status.lastSavedAt ? ` · ${formatTime(status.lastSavedAt)}` : " في المجلد"}
                </span>
              )}
            </div>
          </div>

          {status.lastError && (
            <p className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive" dir="auto">
              {status.lastError}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Button
              onClick={handleSaveNow}
              disabled={busy !== null}
              className="h-11 gap-2 rounded-2xl"
            >
              {busy === "save" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ الآن
            </Button>
            <Button
              onClick={handleReload}
              disabled={busy !== null}
              variant="outline"
              className="h-11 gap-2 rounded-2xl"
            >
              {busy === "reload" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              إعادة القراءة من المجلد
            </Button>
            <Link to={`/setup?next=${encodeURIComponent("/database")}`}>
              <Button
                variant="outline"
                className="h-11 w-full gap-2 rounded-2xl"
                disabled={busy !== null}
              >
                <FolderSync className="h-4 w-4" />
                تغيير المجلد
              </Button>
            </Link>
            <Button
              variant="ghost"
              onClick={() => void signOut()}
              disabled={busy !== null}
              className="h-11 gap-2 rounded-2xl text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              إغلاق قاعدة البيانات
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            كل تعديل يُكتب في المجلد تلقائياً خلال لحظات. داخل المجلد: ملف لكل جدول (مثل{" "}
            <span dir="ltr">students.json</span>)، ومجلد <span dir="ltr">{BACKUPS_DIR}/</span> للنسخ
            الاحتياطية، ومجلد <span dir="ltr">{MEDIA_DIR}/</span> للصور والفيديوهات. لنقل البيانات
            إلى جهاز آخر انسخ المجلد كاملاً ثم اختره من «تغيير المجلد».
          </p>
        </Card>

        {/* محتوى الجداول */}
        <Card className="space-y-3 rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-black">
              <DatabaseIcon className="h-5 w-5 text-primary" />
              محتوى قاعدة البيانات
            </h2>
            <span className="text-sm text-muted-foreground">{total} سجل</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TABLES.filter((t) => t.name !== "profiles").map((t) => (
              <div
                key={t.name}
                className="flex items-center justify-between rounded-2xl bg-muted/50 px-3 py-2 text-sm"
              >
                <span>
                  {t.label}
                  <span className="mr-1 text-[10px] text-muted-foreground" dir="ltr">
                    {t.name}.json
                  </span>
                </span>
                <span className="font-black tabular-nums">{counts[t.name] ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* النسخ الاحتياطية */}
        <Card className="space-y-4 rounded-3xl p-5">
          <h2 className="flex items-center gap-2 font-black">
            <Archive className="h-5 w-5 text-primary" />
            النسخ الاحتياطية
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            يُنشئ التطبيق نسخة احتياطية تلقائية كل يوم داخل مجلد{" "}
            <span dir="ltr">{BACKUPS_DIR}/</span> ويحتفظ بآخر {MAX_DAILY_BACKUPS} يوماً. يمكنك أيضاً
            إنشاء نسخة الآن أو تصدير ملف نسخة احتياطية لحفظه في مكان آخر (حاسب، تيليجرام، فلاش...).
            النسخة تشمل كل الجداول؛ أما الصور والفيديوهات فتبقى في مجلد{" "}
            <span dir="ltr">{MEDIA_DIR}/</span>.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              onClick={handleBackupNow}
              disabled={busy !== null}
              className="h-11 gap-2 rounded-2xl"
            >
              {busy === "backup" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              إنشاء نسخة في المجلد
            </Button>
            <Button
              onClick={handleExport}
              disabled={busy !== null}
              variant="outline"
              className="h-11 gap-2 rounded-2xl"
            >
              {busy === "export" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              تصدير ملف نسخة احتياطية
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== null}
              variant="outline"
              className="h-11 gap-2 rounded-2xl"
            >
              {busy === "import" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              استيراد ملف نسخة احتياطية
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              // على أندرويد لا نقيّد النوع: بعض مديري الملفات يعرّفون ملفات JSON كنوع عام.
              accept={isNativeApp() ? undefined : ".json,application/json"}
              className="hidden"
              onChange={handleImportFile}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="flex items-center gap-1.5">
                <History className="h-4 w-4 text-muted-foreground" />
                النسخ الموجودة في المجلد
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void refreshBackups()}
                className="gap-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingBackups ? "animate-spin" : ""}`} />
                تحديث
              </Button>
            </div>
            {backups.length === 0 ? (
              <p className="rounded-2xl bg-muted/50 p-3 text-sm text-muted-foreground">
                لا توجد نسخ احتياطية بعد — تُنشأ أول نسخة تلقائياً بعد أول حفظ اليوم.
              </p>
            ) : (
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {backups.map((b) => (
                  <div
                    key={b.name}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/50 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-mono text-xs" dir="ltr">
                        {b.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {BACKUP_KIND_LABEL[b.kind]}
                        {b.size ? ` · ${formatSize(b.size)}` : ""}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void askRestoreFromFolder(b)}
                      className="gap-1 rounded-xl"
                    >
                      {busy === `read-${b.name}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <History className="h-3.5 w-3.5" />
                      )}
                      استعادة
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* النقل من النسخة السحابية */}
        <Card className="space-y-4 rounded-3xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-black">
              <CloudDownload className="h-5 w-5 text-primary" />
              نقل البيانات من النسخة السحابية (مرة واحدة)
            </h2>
            <Button size="sm" variant="ghost" onClick={() => setCloudOpen((v) => !v)}>
              {cloudOpen ? "إخفاء" : "عرض"}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            إن كانت بياناتك في النسخة السابقة التي تعمل بالإنترنت، يمكنك نقلها كاملة إلى هذا المجلد
            بحساب الدخول نفسه. <b>يحتاج النقل اتصالاً بالإنترنت مرة واحدة فقط</b>، ثم يعمل التطبيق
            بدونه. سيُستبدل محتوى المجلد الحالي (بعد حفظ نسخة أمان منه).
          </p>

          {cloudOpen && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="email"
                  placeholder="البريد الإلكتروني للنسخة السحابية"
                  value={cloudEmail}
                  onChange={(e) => setCloudEmail(e.target.value)}
                  dir="ltr"
                  className="h-11 rounded-2xl"
                  autoComplete="username"
                />
                <Input
                  type="password"
                  placeholder="كلمة المرور"
                  value={cloudPassword}
                  onChange={(e) => setCloudPassword(e.target.value)}
                  dir="ltr"
                  className="h-11 rounded-2xl"
                  autoComplete="current-password"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={cloudMedia} onCheckedChange={(v) => setCloudMedia(v === true)} />
                نقل الصور والفيديوهات أيضاً (قد يستغرق وقتاً أطول)
              </label>
              <button
                type="button"
                className="text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => setCloudAdvanced((v) => !v)}
              >
                {cloudAdvanced ? "إخفاء الإعدادات المتقدمة" : "إعدادات متقدمة (عنوان الخادم)"}
              </button>
              {cloudAdvanced && (
                <div className="grid gap-2">
                  <Input
                    value={cloudUrl}
                    onChange={(e) => setCloudUrl(e.target.value)}
                    placeholder="https://xxxx.supabase.co"
                    dir="ltr"
                    className="h-10 rounded-xl font-mono text-xs"
                  />
                  <Input
                    value={cloudKey}
                    onChange={(e) => setCloudKey(e.target.value)}
                    placeholder="anon / publishable key"
                    dir="ltr"
                    className="h-10 rounded-xl font-mono text-xs"
                  />
                </div>
              )}
              <Button
                onClick={() => setCloudConfirm(true)}
                disabled={busy !== null || !cloudEmail.trim() || !cloudPassword}
                className="h-11 w-full gap-2 rounded-2xl"
              >
                {busy === "cloud" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudDownload className="h-4 w-4" />
                )}
                بدء النقل
              </Button>
              {cloudProgress && (
                <div className="space-y-1">
                  <Progress
                    value={(cloudProgress.current / Math.max(cloudProgress.total, 1)) * 100}
                    className="h-2"
                  />
                  <p className="text-center text-xs text-muted-foreground">{cloudProgress.label}</p>
                </div>
              )}
              {cloudResult && (
                <p className="flex gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {cloudResult}
                </p>
              )}
              {cloudError && (
                <p className="flex gap-2 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span dir="auto">{cloudError}</span>
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* تأكيد الاستعادة */}
      <AlertDialog open={!!pendingRestore} onOpenChange={(o) => !o && setPendingRestore(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>استعادة النسخة الاحتياطية؟</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p className="font-mono text-xs" dir="ltr">
                  {pendingRestore?.title}
                </p>
                {restoreSummary && (
                  <p>
                    تحتوي على {restoreSummary.students} طالب/طالبة و{restoreSummary.total} سجلاً
                    إجمالاً.
                  </p>
                )}
                <p>
                  سيُستبدل <b>كل</b> محتوى قاعدة البيانات الحالية بمحتوى هذه النسخة. تُحفظ البيانات
                  الحالية أولاً كنسخة أمان داخل مجلد <span dir="ltr">{BACKUPS_DIR}/</span>.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestore}>استعادة</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* تأكيد النقل من السحابة */}
      <AlertDialog open={cloudConfirm} onOpenChange={setCloudConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>نقل البيانات من النسخة السحابية؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيُستبدل محتوى قاعدة البيانات الحالية ({total} سجل) ببيانات حسابك السحابي. تُحفظ
              البيانات الحالية أولاً كنسخة أمان داخل مجلد {BACKUPS_DIR}/. تأكد من اتصال الإنترنت.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => void startCloudImport()}>بدء النقل</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Database;
