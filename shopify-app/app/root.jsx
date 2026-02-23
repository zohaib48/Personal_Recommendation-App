import polarisStyles from "@shopify/polaris/build/esm/styles.css";
import appStyles from "./styles/app.css";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  useLocation,
  ScrollRestoration,
} from "@remix-run/react";
import {
  AppProvider,
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

const navItems = [
  { label: "Overview", url: "/app", icon: HomeIcon },
  { label: "Settings", url: "/app/settings", icon: SettingsIcon },
];

export default function App() {
  const location = useLocation();
  const [mobileNavActive, setMobileNavActive] = useState(false);

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
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider i18n={{}}>
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
        </AppProvider>
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
        <AppProvider i18n={{}}>
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
        </AppProvider>
        <Scripts />
      </body>
    </html>
  );
}
