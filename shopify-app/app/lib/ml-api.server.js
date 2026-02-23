import { config } from "./config.server";

const buildUrl = (base, path, query = {}) => {
  const url = new URL(path, base);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

export const fetchJson = async (url, options = {}, timeoutMs = 3000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed: ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const postWithGetFallback = async (path, payload, query) => {
  try {
    return await fetchJson(
      buildUrl(config.mlApiBaseUrl, path),
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      config.recommendationTimeoutMs
    );
  } catch (error) {
    return await fetchJson(
      buildUrl(config.mlApiBaseUrl, path, query),
      { method: "GET" },
      config.recommendationTimeoutMs
    );
  }
};

export const registerMerchant = async (payload) => {
  return fetchJson(
    buildUrl(config.mlApiBaseUrl, "/api/merchant/register"),
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    config.recommendationTimeoutMs
  );
};

export const getRecommendations = async ({
  merchantId,
  productId,
  customerId,
  location,
  k = 10,
  userHistory,
}) => {
  const payload = {
    merchant_id: merchantId,
    product_id: productId,
    customer_id: customerId,
    location,
    k,
    user_history: userHistory,
  };

  return postWithGetFallback("/api/recommend", payload, {
    shop: merchantId,
    productId,
    customerId,
    location,
    k,
  });
};

export const getPopular = async ({ merchantId, k = 6 }) => {
  const payload = { merchant_id: merchantId, k };
  return postWithGetFallback("/api/popular", payload, { shop: merchantId, k });
};
