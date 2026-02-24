import polarisStyles from "@shopify/polaris/build/esm/styles.css";
import appStyles from "./styles/app.css";
import { json } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  useLocation,
  useLoaderData,
  ScrollRestoration,
} from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Frame,
  Navigation,
  TopBar,
  Text,
} from "@shopify/polaris";
import {
  HomeIcon,
  SettingsIcon,
} from "@shopify/polaris-icons";
import { useMemo, useState } from "react";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles },
];

export const meta = () => [
  { title: "AI Recommendations Admin" },
  { name: "viewport", content: "width=device-width,initial-scale=1" },
];

export const loader = async () =>
  json({
    shopifyApiKey: process.env.SHOPIFY_API_KEY || "",
  });

export default function App() {
  const { shopifyApiKey } = useLoaderData();
  const location = useLocation();
  const [mobileNavActive, setMobileNavActive] = useState(false);
  const embeddedQueryString = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const keep = new URLSearchParams();
    const host = params.get("host");
    const shop = params.get("shop");
    if (host) keep.set("host", host);
    if (shop) keep.set("shop", shop);
    return keep.toString();
  }, [location.search]);

  const navItems = useMemo(
    () => [
      {
        label: "Overview",
        url: embeddedQueryString ? `/app?${embeddedQueryString}` : "/app",
        icon: HomeIcon,
      },
      {
        label: "Settings",
        url: embeddedQueryString ? `/app/settings?${embeddedQueryString}` : "/app/settings",
        icon: SettingsIcon,
      },
    ],
    [embeddedQueryString]
  );

  const topBarMarkup = useMemo(
    () => (
      <TopBar
        showNavigationToggle
        onNavigationToggle={() => setMobileNavActive((active) => !active)}
        userMenu={
          <TopBar.UserMenu
            actions={[{ items: [{ content: "Account settings" }, { content: "Log out" }] }]}
            name="Admin"
            detail="AI Recommendations"
            initials="AR"
          />
        }
      />
    ),
    []
  );

  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section items={navItems} />
    </Navigation>
  );

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        {shopifyApiKey ? <meta name="shopify-api-key" content={shopifyApiKey} /> : null}
        <Meta />
        <Links />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      </head>
      <body>
        <PolarisAppProvider i18n={{}}>
          <Frame
            topBar={topBarMarkup}
            navigation={navigationMarkup}
            showMobileNavigation={mobileNavActive}
            onNavigationDismiss={() => setMobileNavActive(false)}
          >
            <div className="ai-page">
              <Outlet />
            </div>
          </Frame>
        </PolarisAppProvider>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <PolarisAppProvider i18n={{}}>
          <Frame>
            <div style={{ padding: 24 }}>
              <Text as="h2" variant="headingLg">
                Something went wrong
              </Text>
              <Text as="p" variant="bodyMd">
                Refresh the page or contact support if the problem continues.
              </Text>
            </div>
          </Frame>
        </PolarisAppProvider>
        <Scripts />
      </body>
    </html>
  );
}
