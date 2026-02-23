export const config = {
  mlApiBaseUrl: process.env.ML_API_URL || process.env.FLASK_API_URL || "http://localhost:5000",
  analyticsApiBaseUrl: process.env.ANALYTICS_API_URL || process.env.NODE_API_URL || "http://localhost:3000",
  recommendationTimeoutMs: Number.parseInt(process.env.RECOMMENDATION_TIMEOUT_MS || "3000", 10),
  recommendationCacheTtlMs: Number.parseInt(process.env.RECOMMENDATION_CACHE_TTL_MS || "3600000", 10),
  defaultShop: process.env.SHOP_DOMAIN || process.env.DEMO_SHOP || "zohaib-dev-2.myshopify.com",
};
