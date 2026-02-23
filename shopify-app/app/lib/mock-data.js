const today = new Date();

export const products = [
  {
    id: "gid://shopify/Product/1",
    title: "Organic Face Moisturizer",
    price: "29.99",
    image: "https://via.placeholder.com/300?text=Moisturizer",
    category: "Beauty",
  },
  {
    id: "gid://shopify/Product/2",
    title: "Vitamin C Serum",
    price: "39.99",
    image: "https://via.placeholder.com/300?text=Vitamin+C",
    category: "Beauty",
  },
  {
    id: "gid://shopify/Product/3",
    title: "Hydrating Cleanser",
    price: "24.00",
    image: "https://via.placeholder.com/300?text=Cleanser",
    category: "Beauty",
  },
  {
    id: "gid://shopify/Product/4",
    title: "Glow Toner",
    price: "19.00",
    image: "https://via.placeholder.com/300?text=Toner",
    category: "Beauty",
  },
  {
    id: "gid://shopify/Product/5",
    title: "Retinol Night Oil",
    price: "34.00",
    image: "https://via.placeholder.com/300?text=Night+Oil",
    category: "Beauty",
  },
  {
    id: "gid://shopify/Product/6",
    title: "Linen Summer Dress",
    price: "59.00",
    image: "https://via.placeholder.com/300?text=Summer+Dress",
    category: "Fashion",
  },
  {
    id: "gid://shopify/Product/7",
    title: "Classic Denim Jacket",
    price: "89.00",
    image: "https://via.placeholder.com/300?text=Denim+Jacket",
    category: "Fashion",
  },
  {
    id: "gid://shopify/Product/8",
    title: "Minimalist Sneakers",
    price: "74.00",
    image: "https://via.placeholder.com/300?text=Sneakers",
    category: "Fashion",
  },
  {
    id: "gid://shopify/Product/9",
    title: "Cashmere Scarf",
    price: "42.00",
    image: "https://via.placeholder.com/300?text=Scarf",
    category: "Fashion",
  },
  {
    id: "gid://shopify/Product/10",
    title: "Everyday Tote",
    price: "39.00",
    image: "https://via.placeholder.com/300?text=Tote",
    category: "Fashion",
  },
  {
    id: "gid://shopify/Product/11",
    title: "Wireless Earbuds",
    price: "99.00",
    image: "https://via.placeholder.com/300?text=Earbuds",
    category: "Electronics",
  },
  {
    id: "gid://shopify/Product/12",
    title: "Smart Speaker",
    price: "129.00",
    image: "https://via.placeholder.com/300?text=Speaker",
    category: "Electronics",
  },
  {
    id: "gid://shopify/Product/13",
    title: "Portable Charger",
    price: "29.00",
    image: "https://via.placeholder.com/300?text=Charger",
    category: "Electronics",
  },
  {
    id: "gid://shopify/Product/14",
    title: "Noise Canceling Headphones",
    price: "179.00",
    image: "https://via.placeholder.com/300?text=Headphones",
    category: "Electronics",
  },
  {
    id: "gid://shopify/Product/15",
    title: "Smartwatch Band",
    price: "24.00",
    image: "https://via.placeholder.com/300?text=Watch+Band",
    category: "Electronics",
  },
  {
    id: "gid://shopify/Product/16",
    title: "Scented Candle Set",
    price: "32.00",
    image: "https://via.placeholder.com/300?text=Candles",
    category: "Home",
  },
  {
    id: "gid://shopify/Product/17",
    title: "Woven Throw Blanket",
    price: "54.00",
    image: "https://via.placeholder.com/300?text=Throw",
    category: "Home",
  },
  {
    id: "gid://shopify/Product/18",
    title: "Ceramic Vase",
    price: "28.00",
    image: "https://via.placeholder.com/300?text=Vase",
    category: "Home",
  },
  {
    id: "gid://shopify/Product/19",
    title: "Kitchen Storage Set",
    price: "44.00",
    image: "https://via.placeholder.com/300?text=Storage",
    category: "Home",
  },
  {
    id: "gid://shopify/Product/20",
    title: "Weighted Sleep Mask",
    price: "22.00",
    image: "https://via.placeholder.com/300?text=Sleep+Mask",
    category: "Home",
  },
];

export const buildDailyPerformance = () => {
  const points = [];
  for (let i = 29; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const shown = 1200 + Math.floor(Math.random() * 600);
    const clicked = Math.floor(shown * (0.07 + Math.random() * 0.02));
    const converted = Math.floor(clicked * (0.04 + Math.random() * 0.02));
    points.push({
      date: date.toISOString().slice(0, 10),
      shown,
      clicked,
      converted,
    });
  }
  return points;
};

export const topProducts = products.slice(0, 6).map((product, index) => ({
  ...product,
  recommendedCount: 1200 - index * 120,
  ctr: 8.2 - index * 0.4,
  revenue: 3421 - index * 320,
}));

export const productPerformance = products.map((product, index) => ({
  ...product,
  recommendedCount: 900 - index * 30,
  ctr: 8.5 - index * 0.15,
  revenue: 2800 - index * 90,
}));

export const activityFeed = Array.from({ length: 12 }, (_, index) => ({
  id: `activity-${index}`,
  customer: `Customer ${String.fromCharCode(65 + index)}`,
  product: topProducts[index % topProducts.length].title,
  status: index % 3 === 0 ? "purchased" : index % 3 === 1 ? "clicked" : "shown",
  timestamp: `${index + 1} min ago`,
}));

export const categoryPerformance = [
  { name: "Beauty", value: 38 },
  { name: "Fashion", value: 24 },
  { name: "Electronics", value: 21 },
  { name: "Home", value: 17 },
];

export const customerSegments = [
  { name: "Vegan Shoppers", count: 234 },
  { name: "High AOV (>$100)", count: 156 },
  { name: "Frequent Browsers", count: 892 },
  { name: "Cart Abandoners", count: 445 },
];

export const recentCustomers = [
  {
    id: "cust-1",
    name: "Dana Lee",
    email: "dana@example.com",
    segment: "High AOV",
    lastActive: "2 hours ago",
    preferences: ["Vegan", "Premium"],
  },
  {
    id: "cust-2",
    name: "Miguel Santos",
    email: "miguel@example.com",
    segment: "Frequent Browser",
    lastActive: "5 hours ago",
    preferences: ["Sustainable", "Home"],
  },
  {
    id: "cust-3",
    name: "Amira Patel",
    email: "amira@example.com",
    segment: "Beauty Loyalist",
    lastActive: "1 day ago",
    preferences: ["Beauty", "Anti-aging"],
  },
];

export const mockStore = {
  merchant_id: "demo-beauty-store.myshopify.com",
  products,
  analytics: {
    impressions: 45234,
    clicks: 3421,
    conversions: 234,
    revenue: 74215.5,
    ctr: 7.6,
    conversionRate: 5.1,
    aovUplift: 12.4,
  },
};
