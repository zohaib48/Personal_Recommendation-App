export const getShopifySessionToken = async () => {
  if (typeof window === "undefined") return null;

  try {
    const shopifyGlobal = window.shopify;
    if (shopifyGlobal && typeof shopifyGlobal.idToken === "function") {
      const token = await shopifyGlobal.idToken();
      return token || null;
    }
  } catch (_error) {
    // Ignore token acquisition errors; callers can fallback gracefully.
  }

  return null;
};

export const withShopifySessionTokenHeaders = async (headers = {}) => {
  const token = await getShopifySessionToken();
  if (!token) return headers;
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
};
