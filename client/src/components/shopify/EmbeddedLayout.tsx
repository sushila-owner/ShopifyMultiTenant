import { type ReactNode } from "react";
import { AppProvider, Frame, TopBar, Navigation, Page, Layout, Card, Text, BlockStack, InlineStack, Badge, Button } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";
import { 
  HomeIcon, 
  ProductIcon, 
  OrderIcon, 
  SettingsIcon, 
  PackageIcon,
  ChartVerticalIcon
} from "@shopify/polaris-icons";
import { useLocation, Link } from "wouter";
import { useShopifyEmbedded } from "@/lib/shopify-app-bridge";
import { useAuth } from "@/lib/auth";

interface EmbeddedLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  primaryAction?: {
    content: string;
    onAction: () => void;
    loading?: boolean;
  };
  secondaryActions?: Array<{
    content: string;
    onAction: () => void;
  }>;
}

export function EmbeddedLayout({ 
  children, 
  title = "Dashboard",
  subtitle,
  primaryAction,
  secondaryActions
}: EmbeddedLayoutProps) {
  const [location, setLocation] = useLocation();
  const { isEmbedded, shop } = useShopifyEmbedded();
  const { user, isMerchant, isAdmin } = useAuth();

  const navigationItems = isMerchant
    ? [
        {
          url: "/dashboard",
          label: "Dashboard",
          icon: HomeIcon,
          selected: location === "/dashboard",
        },
        {
          url: "/products",
          label: "Catalog",
          icon: ProductIcon,
          selected: location.startsWith("/products"),
        },
        {
          url: "/my-products",
          label: "My Products",
          icon: PackageIcon,
          selected: location.startsWith("/my-products"),
        },
        {
          url: "/orders",
          label: "Orders",
          icon: OrderIcon,
          selected: location.startsWith("/orders"),
        },
        {
          url: "/settings",
          label: "Settings",
          icon: SettingsIcon,
          selected: location === "/settings",
        },
      ]
    : [
        {
          url: "/admin",
          label: "Dashboard",
          icon: HomeIcon,
          selected: location === "/admin",
        },
        {
          url: "/admin/products",
          label: "Products",
          icon: ProductIcon,
          selected: location.startsWith("/admin/products"),
        },
        {
          url: "/admin/orders",
          label: "Orders",
          icon: OrderIcon,
          selected: location.startsWith("/admin/orders"),
        },
        {
          url: "/admin/analytics",
          label: "Analytics",
          icon: ChartVerticalIcon,
          selected: location === "/admin/analytics",
        },
        {
          url: "/admin/settings",
          label: "Settings",
          icon: SettingsIcon,
          selected: location === "/admin/settings",
        },
      ];

  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      userMenu={
        <TopBar.UserMenu
          name={user?.name || "User"}
          detail={shop || user?.email || ""}
          initials={(user?.name?.[0] || "U").toUpperCase()}
          open={false}
          onToggle={() => {}}
          actions={[
            {
              items: [
                {
                  content: "Logout",
                  onAction: () => {
                    localStorage.removeItem("apex_token");
                    localStorage.removeItem("apex_user");
                    setLocation("/login");
                  },
                },
              ],
            },
          ]}
        />
      }
    />
  );

  const navigationMarkup = (
    <Navigation location={location}>
      <Navigation.Section
        items={navigationItems.map((item) => ({
          ...item,
          onClick: () => setLocation(item.url),
        }))}
      />
    </Navigation>
  );

  return (
    <AppProvider i18n={enTranslations}>
      <Frame
        topBar={topBarMarkup}
        navigation={navigationMarkup}
        showMobileNavigation={false}
      >
        <Page
          title={title}
          subtitle={subtitle}
          primaryAction={primaryAction}
          secondaryActions={secondaryActions}
        >
          {children}
        </Page>
      </Frame>
    </AppProvider>
  );
}

export function EmbeddedCard({ 
  title, 
  children,
  sectioned = true
}: { 
  title?: string; 
  children: ReactNode;
  sectioned?: boolean;
}) {
  return (
    <Card>
      {title && (
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">{title}</Text>
          {children}
        </BlockStack>
      )}
      {!title && children}
    </Card>
  );
}

export function EmbeddedPageContent({ children }: { children: ReactNode }) {
  return (
    <Layout>
      <Layout.Section>
        {children}
      </Layout.Section>
    </Layout>
  );
}

export function EmbeddedMetric({
  title,
  value,
  trend,
}: {
  title: string;
  value: string;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="p" variant="bodyMd" tone="subdued">{title}</Text>
        <InlineStack align="space-between" blockAlign="center">
          <Text as="p" variant="headingLg">{value}</Text>
          {trend && (
            <Badge tone={trend.positive ? "success" : "critical"}>
              {trend.value}
            </Badge>
          )}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

export function EmbeddedEmptyState({
  heading,
  action,
  children,
}: {
  heading: string;
  action?: { content: string; onAction: () => void };
  children?: ReactNode;
}) {
  return (
    <Card>
      <BlockStack gap="400" inlineAlign="center">
        <Text as="h2" variant="headingMd">{heading}</Text>
        {children}
        {action && (
          <Button variant="primary" onClick={action.onAction}>
            {action.content}
          </Button>
        )}
      </BlockStack>
    </Card>
  );
}
