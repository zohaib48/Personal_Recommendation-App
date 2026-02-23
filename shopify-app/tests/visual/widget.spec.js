const { test, expect } = require("@playwright/test");
const path = require("path");

const widgetCss = path.resolve(__dirname, "../../extensions/recommendation-widget/assets/widget.css");
const widgetJs = path.resolve(__dirname, "../../extensions/recommendation-widget/assets/widget.js");

const samplePayload = {
  recommendations: [
    {
      shopify_product_id: "gid://shopify/Product/1",
      title: "Sample Serum",
      price: "29.00",
      image: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
      reason: "Customers who liked this also liked",
    },
    {
      shopify_product_id: "gid://shopify/Product/2",
      title: "Hydrating Toner",
      price: "24.00",
      image: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
      reason: "Pairs well with your cart",
    },
  ],
};

test("widget renders for visual snapshot", async ({ page }) => {
  await page.route("**/api/recommend**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(samplePayload) })
  );

  await page.setContent(
    `
      <div data-ai-recommendations
           data-merchant="demo.myshopify.com"
           data-location="product_page"
           data-product-id="gid://shopify/Product/1"
           data-api-base="https://example.com"
           data-title="You Might Also Like"
           data-limit="2"></div>
    `
  );

  await page.addStyleTag({ path: widgetCss });
  await page.addScriptTag({ path: widgetJs });

  await page.waitForTimeout(1000);

  await expect(page.locator(".ai-rec-widget")).toHaveScreenshot("widget.png");
});
