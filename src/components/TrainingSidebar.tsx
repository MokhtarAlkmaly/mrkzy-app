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
import { LayoutGrid, Users, BookMarked, ArrowLeftRight, Database } from "lucide-react";
import { DbStatusIndicator } from "@/components/DbStatusIndicator";
import logo from "@/assets/logo.png";

const items = [
  { to: "/training", label: "الرئيسية", icon: LayoutGrid },
  { to: "/trainees", label: "المتدربون", icon: Users },
  { to: "/courses", label: "الدورات", icon: BookMarked },
];

export function TrainingSidebar() {
  const location = useLocation();
  const pathname = location?.pathname || "";

  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <img src={logo} alt="الشعار" className="h-8 w-8 rounded-md object-contain" />
          <span className="text-sm font-bold group-data-[collapsible=icon]:hidden">
            التدريب والتأهيل
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>القسم</SidebarGroupLabel>
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/database"}>
                  <Link to="/database">
                    <Database />
                    <span>قاعدة البيانات</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/">
                    <ArrowLeftRight />
                    <span>تبديل القسم</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <DbStatusIndicator />
      </SidebarFooter>
    </Sidebar>
  );
}
