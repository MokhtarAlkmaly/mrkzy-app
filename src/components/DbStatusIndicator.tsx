import { CheckCircle2, AlertTriangle, Loader2, FolderOpen } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { useDbStatus } from "@/offline/useDbStatus";

/** مؤشر صغير في أسفل القائمة الجانبية: مجلد قاعدة البيانات وحالة الحفظ. */
export const DbStatusIndicator = () => {
  const status = useDbStatus();
  if (!status.open) return null;

  const saving = status.saving || status.dirtyTables > 0;

  return (
    <Link
      to="/database"
      className="block rounded-lg border bg-muted/40 p-2 text-xs transition-colors hover:bg-muted"
    >
      <div className="flex items-center gap-1.5 font-bold">
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate" dir="auto" title={status.folderLabel}>
          {status.folderLabel}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1 text-[11px]">
        {status.lastError ? (
          <>
            <AlertTriangle className="h-3 w-3 text-destructive" />
            <span className="text-destructive">تعذّر الحفظ — اضغط للتفاصيل</span>
          </>
        ) : saving ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
            <span className="text-muted-foreground">جارٍ الحفظ في المجلد…</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span className="text-muted-foreground">
              محفوظ في المجلد
              {status.lastSavedAt
                ? ` · ${new Date(status.lastSavedAt).toLocaleTimeString("ar", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : ""}
            </span>
          </>
        )}
      </div>
    </Link>
  );
};
