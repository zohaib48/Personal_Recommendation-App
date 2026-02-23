import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.ML_API_URL = "http://example.com";
const { getRecommendations } = await import("../../app/lib/ml-api.server.js");

describe("ml api integration", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            recommendations: [
              { shopify_product_id: "gid://shopify/Product/1", title: "Test", price: "10" },
            ],
            count: 1,
          }),
      })
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches recommendations", async () => {
    const data = await getRecommendations({
      merchantId: "demo.myshopify.com",
      productId: "gid://shopify/Product/1",
      customerId: "customer-1",
      k: 4,
    });

    expect(data.recommendations.length).toBe(1);
  });
});
