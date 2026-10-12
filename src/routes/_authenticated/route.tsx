import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TrainingSidebar } from "@/components/TrainingSidebar";
import { DbStatusBanner } from "@/components/DbStatusBanner";
import { useLocation } from "@/lib/router-compat";
import { requireDatabase } from "@/offline/routeGuard";

const TRAINING_PATHS = ["/training", "/trainees", "/courses"];

function AuthenticatedLayout() {
  const location = useLocation();
  const pathname = location?.pathname || "";

  // شاشة اختيار القسم: بلا شريط جانبي، تعرض بكامل الشاشة
  if (pathname === "/") {
    return (
      <>
        <DbStatusBanner />
        <Outlet />
      </>
    );
  }

  const isTraining = TRAINING_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  return (
    <SidebarProvider>
      {isTraining ? <TrainingSidebar /> : <AppSidebar />}
      <SidebarInset>
        {/* يظهر فقط عند تعذّر الحفظ في مجلد قاعدة البيانات أو وجود تحذيرات */}
        <DbStatusBanner />
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/80 px-2 py-1.5 backdrop-blur">
          <SidebarTrigger />
          <span className="text-xs text-muted-foreground">القائمة</span>
        </div>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

// النسخة التي تعمل بدون إنترنت: لا تسجيل دخول. الشرط الوحيد لدخول التطبيق
// أن تكون قاعدة بيانات المجلد مفتوحة — وإلا تظهر شاشة اختيار المجلد.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    await requireDatabase(location);
  },
  component: AuthenticatedLayout,
});
