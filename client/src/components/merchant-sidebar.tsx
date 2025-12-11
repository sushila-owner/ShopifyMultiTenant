import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Search,
  CreditCard,
  UserPlus,
  Plug,
  Wallet,
  Upload,
  Webhook,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import logoImage from "@assets/F66C5CC9-75FA-449A-AAF8-3CBF0FAC2486_1764749832622.png";
import { GlobeSettings } from "@/components/globe-settings";

const mainMenuItems = [
  { titleKey: "merchant.sidebar.dashboard" as const, url: "/dashboard", icon: LayoutDashboard },
  { titleKey: "merchant.sidebar.catalog" as const, url: "/dashboard/catalog", icon: Search },
  { titleKey: "merchant.sidebar.products" as const, url: "/dashboard/products", icon: Package },
  { titleKey: "merchant.sidebar.orders" as const, url: "/dashboard/orders", icon: ShoppingCart },
  { titleKey: "merchant.sidebar.customers" as const, url: "/dashboard/customers", icon: Users },
];

const businessMenuItems = [
  { titleKey: "merchant.sidebar.analytics" as const, url: "/dashboard/analytics", icon: BarChart3 },
  { titleKey: "merchant.sidebar.import" as const, url: "/dashboard/import", icon: Upload },
  { titleKey: "merchant.sidebar.webhooks" as const, url: "/dashboard/webhooks", icon: Webhook },
  { titleKey: "merchant.sidebar.integrations" as const, url: "/dashboard/integrations", icon: Plug },
  { titleKey: "merchant.sidebar.team" as const, url: "/dashboard/team", icon: UserPlus },
];

const settingsMenuItems = [
  { titleKey: "merchant.sidebar.wallet" as const, url: "/dashboard/wallet", icon: Wallet },
  { titleKey: "merchant.sidebar.subscription" as const, url: "/dashboard/subscription", icon: CreditCard },
  { titleKey: "merchant.sidebar.settings" as const, url: "/dashboard/settings", icon: Settings },
];

export function MerchantSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { t } = useI18n();

  const { data: stats } = useQuery<{ currentProductCount: number; productLimit: number }>({
    queryKey: ["/api/merchants/stats"],
  });

  const { data: walletData } = useQuery<{ data: { balanceCents: number } }>({
    queryKey: ["/api/wallet/balance"],
  });

  const isActive = (url: string) => {
    if (url === "/dashboard") return location === "/dashboard";
    return location.startsWith(url);
  };

  const productUsage = stats ? (stats.currentProductCount / stats.productLimit) * 100 : 0;

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <img src={logoImage} alt="Apex Mart Wholesale" className="h-9 w-9 rounded-md object-cover" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Apex Mart Wholesale</span>
            <span className="text-xs text-muted-foreground">Merchant Dashboard</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("merchant.sidebar.main")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    data-testid={`nav-${item.url.split('/').pop()}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{t(item.titleKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("merchant.sidebar.business")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {businessMenuItems.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    data-testid={`nav-${item.url.split('/').pop()}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{t(item.titleKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("merchant.sidebar.account")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsMenuItems.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    data-testid={`nav-${item.url.split('/').pop()}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1">{t(item.titleKey)}</span>
                      {item.url === "/dashboard/wallet" && walletData?.data && (
                        <Badge 
                          variant="secondary" 
                          className="ml-auto text-xs"
                          data-testid="badge-wallet-balance"
                        >
                          ${(walletData.data.balanceCents / 100).toFixed(2)}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Product Usage Indicator */}
        {stats && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("merchant.sidebar.productUsage")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="px-2 py-2">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-muted-foreground">{t("merchant.sidebar.products")}</span>
                  <span className="font-medium">
                    {stats.currentProductCount} / {stats.productLimit}
                  </span>
                </div>
                <Progress value={productUsage} className="h-2" />
                {productUsage > 80 && (
                  <p className="text-xs text-chart-4 mt-1">
                    {t("merchant.sidebar.approachingLimit")}
                  </p>
                )}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs text-muted-foreground">{t("merchant.sidebar.languageCurrency")}</span>
              <GlobeSettings />
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {user?.name?.charAt(0).toUpperCase() || "M"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium truncate">{user?.name || "Merchant"}</span>
                <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
              </div>
              <Badge variant="outline" className="text-xs">Pro</Badge>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={logout}
              className="text-destructive hover:text-destructive"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              <span>{t("merchant.sidebar.logout")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
