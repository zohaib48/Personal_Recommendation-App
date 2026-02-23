import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  Card,
  Layout,
  Page,
  Text,
  Banner,
} from "@shopify/polaris";
import {
  GaugeIcon,
  CursorOptionIcon,
  CashDollarIcon,
  ChartLineIcon,
} from "@shopify/polaris-icons";
import StatsCard from "../components/StatsCard";
import PerformanceChart from "../components/PerformanceChart";
import ProductTable from "../components/ProductTable";
import { getDashboardOverview } from "../lib/analytics.server";
import { config } from "../lib/config.server";

export const loader = async () => {
  const overview = await getDashboardOverview();
  return json({ ...overview, shop: config.defaultShop });
};

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));
const fmtCurrency = (n) =>
  n >= 1000 ? "$" + (n / 1000).toFixed(1) + "k" : "$" + n.toFixed(2);

export default function OverviewPage() {
  const { store, metrics, chart, topProducts, activityFeed, apiStatus } =
    useLoaderData();
  const cleanTopProducts = (topProducts || []).filter(
    (product) =>
      product &&
      product.id &&
      typeof product.title === "string" &&
      product.title.trim() &&
      !product.title.startsWith("gid://shopify/Product/")
  );

  const impressions = metrics?.impressions || 0;
  const clicks = metrics?.clicks || 0;
  const conversions = metrics?.conversions || 0;
  const revenue = metrics?.revenue || 0;
  const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : "0";

  const hasData = impressions > 0;

  return (
    <Page title="Overview">
      <Layout>
        {apiStatus === "down" ? (
          <Layout.Section>
            <Banner tone="critical" title="Recommendation API is unreachable">
              <Text as="p" variant="bodySm">
                Showing cached insights. Check your Flask API and network
                settings.
              </Text>
            </Banner>
          </Layout.Section>
        ) : null}

        {!hasData ? (
          <Layout.Section>
            <Banner tone="info" title="No analytics data yet">
              <Text as="p" variant="bodySm">
                Stats will appear here once customers start seeing
                recommendations on your storefront.
              </Text>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <div className="ai-hero-grid">
            <StatsCard
              title="Recommendations served"
              value={fmt(impressions)}
              icon={GaugeIcon}
            />
            <StatsCard
              title="Click-through rate"
              value={ctr + "%"}
              icon={CursorOptionIcon}
            />
            <StatsCard
              title="Revenue attributed"
              value={fmtCurrency(revenue)}
              icon={CashDollarIcon}
            />
            <StatsCard
              title="Conversions"
              value={fmt(conversions)}
              icon={ChartLineIcon}
            />
          </div>
        </Layout.Section>

        {chart.length > 0 ? (
          <Layout.Section>
            <PerformanceChart
              data={chart}
              title="Recommendation performance (30 days)"
            />
          </Layout.Section>
        ) : null}

        {cleanTopProducts.length > 0 ? (
          <Layout.Section>
            <Card>
              <div className="ai-card-header">
                <Text as="h2" variant="headingMd">
                  Top performing products
                </Text>
              </div>
              <div style={{ marginTop: 16 }}>
                <ProductTable products={cleanTopProducts} />
              </div>
            </Card>
          </Layout.Section>
        ) : null}

        {activityFeed.length > 0 ? (
          <Layout.Section>
            <Card>
              <Text as="h2" variant="headingMd">
                Recent activity
              </Text>
              <div style={{ marginTop: 12 }}>
                {activityFeed.map((activity) => (
                  <div key={activity.id} className="ai-activity-item">
                    <div>
                      <Text as="p" variant="bodyMd">
                        {activity.customer} got recommendation for{" "}
                        {activity.product}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {activity.timestamp}
                      </Text>
                    </div>
                    <div className="ai-activity-status">
                      <Badge
                        tone={
                          activity.status === "purchased"
                            ? "success"
                            : activity.status === "clicked"
                              ? "info"
                              : "subdued"
                        }
                      >
                        {activity.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </Layout.Section>
        ) : null}
      </Layout>
    </Page>
  );
}
