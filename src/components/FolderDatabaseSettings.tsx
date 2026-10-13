import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Database, Download, Upload, FolderOpen, Loader2 } from "lucide-react";
import {
  DB_FOLDER,
  FOLDER_LOCATION_LABELS,
  describeFolderPath,
  getFolderLocation,
  moveFolderDatabase,
  writeDatabaseBackupFile,
  importDatabaseBackup,
  exportDatabaseBackup,
  type FolderLocation,
} from "@/utils/folderDB";

/**
 * قسم «قاعدة البيانات المجلدية» في الإعدادات:
 * مكان مجلد القاعدة على الهاتف، نقله، نسخة احتياطية، واستعادة.
 */
export const FolderDatabaseSettings = () => {
  const { toast } = useToast();
  const [location, setLocation] = useState<FolderLocation>(getFolderLocation());
  const [busy, setBusy] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleMove = async (loc: FolderLocation) => {
    if (loc === location) return;
    setBusy("move");
    const ok = await moveFolderDatabase(loc);
    setBusy(null);
    if (ok) {
      setLocation(loc);
      toast({
        title: "تم نقل قاعدة البيانات",
        description: `أصبح مجلد ${DB_FOLDER} في: ${describeFolderPath(loc)}`,
      });
    } else {
      toast({
        title: "تعذّر نقل قاعدة البيانات",
        description: "تحقق من إذن التخزين ثم حاول مجدداً.",
        variant: "destructive",
      });
    }
  };

  const handleBackup = async () => {
    setBusy("backup");
    try {
      const file = await writeDatabaseBackupFile();
      toast({
        title: "تم حفظ النسخة الاحتياطية",
        description: `الملف: ${file} — بجانب مجلد ${DB_FOLDER} (أو في التنزيلات على الويب).`,
      });
    } catch {
      toast({ title: "تعذّر إنشاء النسخة الاحتياطية", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadBackup = async () => {
    setBusy("download");
    try {
      const backup = await exportDatabaseBackup();
      const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mrkzy-backup-${backup.exportedAt.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "تم تنزيل النسخة الاحتياطية" });
    } finally {
      setBusy(null);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!confirm("الاستعادة تستبدل كل البيانات الحالية بالنسخة المختارة. متابعة؟")) return;
    setBusy("import");
    try {
      const parsed = JSON.parse(await file.text());
      await importDatabaseBackup(parsed);
      toast({ title: "تمت الاستعادة", description: "أعد تحميل التطبيق لعرض البيانات المستعادة." });
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast({
        title: "تعذّرت الاستعادة",
        description: err instanceof Error ? err.message : "ملف غير صالح",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" />
        <div>
          <div className="text-sm font-semibold">قاعدة البيانات المجلدية (دون إنترنت)</div>
          <div className="text-xs text-muted-foreground">
            كل بياناتك في مجلد{" "}
            <span dir="ltr" className="font-mono">
              {DB_FOLDER}
            </span>{" "}
            على هذا الجهاز — ملف JSON لكل جدول. انسخ المجلد لنقل بياناتك لجهاز آخر.
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium flex items-center gap-1">
          <FolderOpen className="h-3.5 w-3.5" /> مكان مجلد القاعدة على الهاتف
        </label>
        <Select value={location} onValueChange={(v) => void handleMove(v as FolderLocation)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FOLDER_LOCATION_LABELS) as FolderLocation[]).map((loc) => (
              <SelectItem key={loc} value={loc}>
                {FOLDER_LOCATION_LABELS[loc]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          المسار الحالي: {describeFolderPath(location)} — تغيير المكان ينقل كل الملفات تلقائياً.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!!busy}
          onClick={() => void handleBackup()}
        >
          {busy === "backup" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          حفظ نسخة احتياطية بجانب القاعدة
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!!busy}
          onClick={() => void handleDownloadBackup()}
        >
          {busy === "download" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          تنزيل نسخة (JSON)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!!busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy === "import" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          استعادة من نسخة…
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void handleImportFile(e)}
        />
      </div>
    </div>
  );
};
