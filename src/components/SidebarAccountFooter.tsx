import { useState } from "react";
import { LogOut, Loader2, Wifi, WifiOff } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSignOut } from "@/hooks/useSignOut";

/** الاسم الظاهر للحساب: الاسم المسجَّل عند الإنشاء، وإلا مقدمة البريد. */
const getDisplayName = (
  metadata: Record<string, unknown> | undefined,
  email: string | undefined,
) => {
  const name = metadata?.display_name ?? metadata?.full_name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return email?.split("@")[0] || "مستخدم";
};

/**
 * تذييل القائمة الجانبية: بطاقة الحساب الحالي، وحالة العمل المحلي،
 * وزر تسجيل الخروج. في وضع القائمة المصغّرة تظهر الأيقونات فقط مع تلميح.
 */
export function SidebarAccountFooter() {
  const { user } = useAuth();
  const signOut = useSignOut();
  const online = useOnlineStatus();
  const { isMobile, setOpenMobile } = useSidebar();
  const [signingOut, setSigningOut] = useState(false);

  const displayName = getDisplayName(user?.user_metadata, user?.email);
  const initial = displayName.trim().charAt(0) || "؟";
  const statusLabel = "محلي — أوفلاين";
  const statusHint = "كل البيانات تُحفظ فوراً في مجلد MrkzyDatabase على هذا الجهاز";

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      // يرفع التعديلات المعلّقة أولاً (ويطلب التأكيد إن تعذّر الرفع).
      const done = await signOut();
      if (done && isMobile) setOpenMobile(false);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SidebarMenu>
      {/* بطاقة الحساب — تختفي في وضع الأيقونات */}
      <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary"
            aria-hidden="true"
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold" title={displayName}>
              {displayName}
            </p>
            {user?.email && (
              <p
                className="truncate text-[10px] text-muted-foreground"
                dir="ltr"
                title={user.email}
              >
                {user.email}
              </p>
            )}
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
              online
                ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300"
                : "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-300"
            }`}
            title={statusHint}
            role="status"
          >
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {statusLabel}
          </span>
        </div>
      </SidebarMenuItem>

      {/* حالة الاتصال في وضع الأيقونات فقط */}
      <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
        <SidebarMenuButton
          tooltip={statusHint}
          className={`cursor-default hover:bg-transparent active:bg-transparent ${
            online
              ? "text-emerald-600 hover:text-emerald-600 active:text-emerald-600"
              : "text-rose-600 hover:text-rose-600 active:text-rose-600"
          }`}
          aria-label={statusLabel}
        >
          {online ? <Wifi /> : <WifiOff />}
          <span>{statusLabel}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip="تسجيل الخروج"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/10 active:text-destructive"
        >
          {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
          <span>{signingOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
