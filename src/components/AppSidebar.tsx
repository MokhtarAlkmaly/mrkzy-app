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
import { Link, useLocation } from "@/lib/router-compat";
import {
  Trophy,
  GraduationCap,
  Users,
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
} from "lucide-react";
import logo from "@/assets/logo.png";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Trophy;
}

const mainItems: NavItem[] = [
  { to: "/quran", label: "الرئيسية", icon: LayoutGrid },
  { to: "/students", label: "الطلاب", icon: GraduationCap },
  { to: "/teachers", label: "المعلمين", icon: Users },
  { to: "/monthly", label: "المتابعة الشهرية", icon: Sparkles },
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

const switchItems: NavItem[] = [{ to: "/", label: "تبديل القسم", icon: ArrowLeftRight }];

const NavGroup = ({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) => (
  <SidebarGroup>
    <SidebarGroupLabel>{label}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton asChild isActive={pathname === item.to}>
              <Link to={item.to}>
                <item.icon />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
);

export function AppSidebar() {
  const location = useLocation();
  const pathname = location?.pathname || "";

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
        <NavGroup label="النظام" items={systemItems} pathname={pathname} />
        <NavGroup label="" items={switchItems} pathname={pathname} />
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
