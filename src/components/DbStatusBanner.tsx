import { useState } from "react";
import { AlertTriangle, RefreshCw, FolderCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import { db } from "@/offline/dbManager";
import { useDbStatus } from "@/offline/useDbStatus";

/**
 * شريط تنبيه يظهر فقط عند تعذّر الحفظ في مجلد قاعدة البيانات (مثلاً أُزيلت
 * بطاقة SD أو سُحبت الصلاحية) أو عند وجود تحذيرات أثناء فتح المجلد.
 * البيانات تبقى في الذاكرة ويعاد الحفظ تلقائياً.
 */
export const DbStatusBanner = () => {
  const status = useDbStatus();
  const [retrying, setRetrying] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState(false);

  if (!status.open) return null;

  if (status.lastError) {
    return (
      <div
        className="flex flex-wrap items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive print:hidden"
        dir="rtl"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1 min-w-48">
          تعذّر الحفظ في مجلد قاعدة البيانات ({status.folderLabel}). تعديلاتك محفوظة مؤقتاً في
          الذاكرة وستُعاد محاولة الحفظ تلقائياً — لا تغلق التطبيق قبل نجاح الحفظ.
          <span className="block text-xs opacity-80" dir="auto">
            {status.lastError}
          </span>
        </span>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            try {
              await db.flush();
            } catch {
              /* الرسالة تبقى ظاهرة */
            } finally {
              setRetrying(false);
            }
          }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
          إعادة المحاولة
        </Button>
        <Link to="/database">
          <Button size="sm" variant="ghost" className="gap-1">
            <FolderCog className="h-3.5 w-3.5" />
            قاعدة البيانات
          </Button>
        </Link>
      </div>
    );
  }

  if (status.warnings.length > 0 && !dismissedWarnings) {
    return (
      <div
        className="flex flex-wrap items-start gap-2 border-b border-amber-400/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden"
        dir="rtl"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1 space-y-1">
          {status.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setDismissedWarnings(true)}>
          إخفاء
        </Button>
      </div>
    );
  }

  return null;
};
