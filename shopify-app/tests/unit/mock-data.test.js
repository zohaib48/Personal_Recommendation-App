import { describe, it, expect } from "vitest";
import { buildDailyPerformance, mockStore } from "../../app/lib/mock-data.js";

describe("mock data", () => {
  it("builds 30 days of performance data", () => {
    const data = buildDailyPerformance();
    expect(data.length).toBe(30);
    expect(data[0]).toHaveProperty("shown");
  });

  it("includes mock store metadata", () => {
    expect(mockStore.merchant_id).toContain("myshopify.com");
    expect(mockStore.products.length).toBeGreaterThan(10);
  });
});
