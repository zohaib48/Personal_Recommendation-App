import { Card, Text } from "@shopify/polaris";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function PerformanceChart({ data, title }) {
  return (
    <Card>
      <div className="ai-card-header">
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
      </div>
      <div className="ai-chart-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" hide={false} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="shown" stroke="#5c6ac4" strokeWidth={2} />
            <Line type="monotone" dataKey="clicked" stroke="#008060" strokeWidth={2} />
            <Line type="monotone" dataKey="converted" stroke="#d82c0d" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
