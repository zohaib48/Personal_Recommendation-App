import { Badge, Card, Icon, InlineStack, Text } from "@shopify/polaris";
import { ArrowUpIcon, ArrowDownIcon } from "@shopify/polaris-icons";

export default function StatsCard({ title, value, change, icon }) {
  const hasChange = change !== undefined && change !== null;
  const isPositive = hasChange && change >= 0;
  const changeText = hasChange ? `${isPositive ? "+" : ""}${change}%` : null;

  return (
    <Card>
      <div className="ai-stat-card">
        <InlineStack align="space-between">
          <Text as="p" variant="bodyMd" tone="subdued">
            {title}
          </Text>
          {icon ? <Icon source={icon} tone="base" /> : null}
        </InlineStack>
        <Text as="h3" variant="headingLg">
          {value}
        </Text>
        {hasChange ? (
          <InlineStack gap="200">
            <Badge tone={isPositive ? "success" : "critical"}>
              <InlineStack gap="100" align="center">
                <Icon source={isPositive ? ArrowUpIcon : ArrowDownIcon} tone="base" />
                <Text as="span" variant="bodySm">
                  {changeText}
                </Text>
              </InlineStack>
            </Badge>
            <Text as="span" variant="bodySm" tone="subdued">
              vs last period
            </Text>
          </InlineStack>
        ) : null}
      </div>
    </Card>
  );
}
