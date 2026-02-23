import { config } from "./config.server";
import { fetchJson } from "./ml-api.server";

const apiBase = () => config.analyticsApiBaseUrl.replace(/\/$/, "");
const shopQuery = () => `shop=${encodeURIComponent(config.defaultShop)}`;

export const getDashboardOverview = async () => {
  const base = apiBase();
  const [dashboard, health] = await Promise.all([
    fetchJson(`${base}/api/dashboard?${shopQuery()}`),
    fetchJson(`${config.mlApiBaseUrl.replace(/\/$/, "")}/health`, { method: "GET" }, 2000).catch(() => null),
  ]);

  return {
    store: { merchant_id: config.defaultShop, products: [] },
    metrics: dashboard.metrics || { impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
    chart: dashboard.chart || [],
    topProducts: dashboard.topProducts || [],
    activityFeed: dashboard.activityFeed || [],
    apiStatus: health ? "healthy" : "down",
  };
};

export const trackEvent = async (payload) => {
  const baseUrl = config.analyticsApiBaseUrl;
  if (!baseUrl) {
    return { success: true, skipped: true };
  }

  try {
    const url = `${baseUrl.replace(/\/$/, "")}/api/track/event`;
    return await fetchJson(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
};
