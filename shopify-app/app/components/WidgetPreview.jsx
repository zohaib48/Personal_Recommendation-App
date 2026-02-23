import { Card, Text } from "@shopify/polaris";

export default function WidgetPreview({ layout, title, items, primaryColor, buttonStyle }) {
  return (
    <Card>
      <div className="ai-widget-preview">
        <Text as="h3" variant="headingMd">
          {title}
        </Text>
        <div className="ai-widget-grid" style={{ marginTop: 12 }}>
          {items.map((item) => (
            <div key={item.id} className="ai-widget-card">
              <img src={item.image} alt={item.title} />
              <Text as="p" variant="bodySm">
                {item.title}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                ${item.price}
              </Text>
              <span
                className="ai-widget-button"
                style={{
                  background: primaryColor,
                  borderRadius: buttonStyle === "rounded" ? "999px" : "6px",
                }}
              >
                Add
              </span>
            </div>
          ))}
        </div>
        <Text as="p" variant="bodySm" tone="subdued" style={{ marginTop: 12 }}>
          Layout: {layout}
        </Text>
      </div>
    </Card>
  );
}
