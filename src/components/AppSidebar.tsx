import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "@/lib/router-compat";
import { useAuth } from "@/hooks/useAuth";
import {
  Trophy,
  GraduationCap,
  Users,
  UsersRound,
  Sparkles,
  Home as HomeIcon,
  Globe2,
  Award,
  ScrollText,
  HeartHandshake,
  Receipt,
  Camera,
  BookOpenCheck,
  LayoutDashboard,
  Settings as SettingsIcon,
  FileText,
  LayoutGrid,
  ArrowLeftRight,
  Link2,
  Inbox,
  UserCog,
  Eye,
  EyeOff,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { SidebarAccountFooter } from "@/components/SidebarAccountFooter";
import { flushLocalDatabase } from "@/hooks/useLocalDatabase";
import { confirmCacheReset } from "@/hooks/useSignOut";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Trophy;
  /** شارة صغيرة تظهر يسار الاسم (مثلاً «المسؤول») */
  badge?: string;
}

const mainItems: NavItem[] = [
  { to: "/quran", label: "الرئيسية", icon: LayoutGrid },
  { to: "/students", label: "الطلاب", icon: GraduationCap },
  { to: "/halaqat", label: "إدارة الحلقات", icon: UsersRound },
  { to: "/teachers", label: "المعلمين", icon: Users },
  { to: "/monthly", label: "المتابعة الشهرية", icon: Sparkles },
  { to: "/teacher-links", label: "روابط المعلمين والمعلمات", icon: Link2 },
  { to: "/submissions", label: "وارد المعلمين والمعلمات", icon: Inbox },
  { to: "/ramadan-competition", label: "المسابقة الرمضانية", icon: Trophy },
];

const competitionItems: NavItem[] = [
  { to: "/internal-competition", label: "المسابقة الداخلية", icon: HomeIcon },
  { to: "/external-competition", label: "المسابقة الخارجية", icon: Globe2 },
];

const otherItems: NavItem[] = [
  { to: "/awards", label: "التكريم", icon: Award },
  { to: "/khatimat", label: "الخاتمون والخاتمات", icon: Sparkles },
  { to: "/certificates", label: "الشهادات", icon: ScrollText },
  { to: "/reports", label: "التقارير", icon: FileText },
  { to: "/donors", label: "الداعمون", icon: HeartHandshake },
  { to: "/expenses", label: "المصروفات", icon: Receipt },
  { to: "/media", label: "الوسائط", icon: Camera },
  { to: "/exam-questions", label: "أسئلة الاختبارات", icon: BookOpenCheck },
];

const systemItems: NavItem[] = [
  { to: "/management", label: "الإدارة", icon: LayoutDashboard },
  { to: "/settings", label: "الإعدادات", icon: SettingsIcon },
];

/** تظهر للمسؤول فقط */
const adminItems: NavItem[] = [
  { to: "/users", label: "إدارة المستخدمين", icon: UserCog, badge: "المسؤول" },
];

const switchItems: NavItem[] = [{ to: "/", label: "تبديل القسم", icon: ArrowLeftRight }];

const NavGroup = ({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) => {
  if (items.length === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild isActive={pathname === item.to} tooltip={item.label}>
                <Link to={item.to}>
                  <item.icon />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-black text-amber-600 ring-1 ring-amber-400/40">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

/**
 * مبدّل «الاطلاع على بيانات مستخدم آخر» (عرض باسم).
 *
 * يظهر فقط لمن مُنح إذن الاطلاع من صاحب بيانات، أو لمن هو في وضع الاطلاع
 * فعلاً. الدخول/الخروج يعيد تحميل الصفحة لتفريغ بيانات المالك السابق من
 * الذاكرة والكاش المحلي.
 */
const ViewAsSwitcher = () => {
  const { sharedWithMe, viewAs, setViewAs } = useAuth();

  if (!viewAs && sharedWithMe.length === 0) return null;

  // نحفظ أي كتابات محلية مؤجَّلة قبل إعادة التحميل حتى لا يضيع آخر تعديل.
  const enter = async (ownerId: string, name: string, email: string | null) => {
    // الدخول لوضع الاطلاع يستبدل الكاش المحلي ببيانات المالك: نرفع تعديلاتي
    // المعلّقة أولاً حتى لا تضيع.
    if (!(await confirmCacheReset("الانتقال للاطلاع على بيانات مستخدم آخر"))) return;
    await flushLocalDatabase();
    setViewAs({ id: ownerId, name, email });
    if (typeof window !== "undefined") window.location.reload();
  };

  const exit = async () => {
    await flushLocalDatabase();
    setViewAs(null);
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <div className="rounded-lg border bg-muted/40 p-2 group-data-[collapsible=icon]:hidden">
      {viewAs ? (
        <>
          <p className="mb-1.5 px-1 text-[10px] font-bold text-amber-600">
            تطالع بيانات: {viewAs.name}
          </p>
          <Button
            onClick={() => void exit()}
            variant="ghost"
            size="sm"
            className="w-full justify-center gap-2 text-amber-700 hover:bg-amber-500/15"
          >
            <EyeOff className="h-4 w-4" />
            <span>العودة لبياناتي</span>
          </Button>
        </>
      ) : (
        <>
          <p className="mb-1.5 px-1 text-[10px] font-bold text-muted-foreground">
            مسموح لك بالاطلاع على
          </p>
          {sharedWithMe.map((owner) => (
            <Button
              key={owner.owner_id}
              onClick={() => void enter(owner.owner_id, owner.name, owner.email)}
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
            >
              <Eye className="h-4 w-4 shrink-0" />
              <span className="truncate">{owner.name}</span>
            </Button>
          ))}
        </>
      )}
    </div>
  );
};

export function AppSidebar() {
  const location = useLocation();
  const pathname = location?.pathname || "";
  const { isAdmin } = useAuth();

  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <img src={logo} alt="الشعار" className="h-8 w-8 rounded-md object-contain" />
          <span className="text-sm font-bold group-data-[collapsible=icon]:hidden">
            إنماء الأهلي الخيري
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label="الرئيسية" items={mainItems} pathname={pathname} />
        <NavGroup label="المسابقات" items={competitionItems} pathname={pathname} />
        <NavGroup label="أقسام أخرى" items={otherItems} pathname={pathname} />
        <NavGroup
          label="النظام"
          items={isAdmin ? [...systemItems, ...adminItems] : systemItems}
          pathname={pathname}
        />
        <NavGroup label="" items={switchItems} pathname={pathname} />
      </SidebarContent>
      <SidebarFooter>
        <ViewAsSwitcher />
        <SidebarAccountFooter />
      </SidebarFooter>
    </Sidebar>
  );
}
