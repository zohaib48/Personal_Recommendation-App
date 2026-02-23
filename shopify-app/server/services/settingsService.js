const Merchant = require('../models/Merchant');
const MerchantSettings = require('../models/MerchantSettings');
const RecommendationEvent = require('../models/RecommendationEvent');
const Product = require('../models/Product');

// AI Autopilot defaults — best-practice configuration
const AI_AUTOPILOT_DEFAULTS = {
  filters: {
    priceProximity: { enabled: true, range: 0.30 },
    tagBoost: { enabled: true, weight: 0.15 },
    locationFilter: { enabled: true },
    ethicalFilter: { enabled: false, vegan: false, sustainable: false },
    excludeViewed: false,
    excludePurchased: true,
    sameCategoryOnly: true,
  },
  weights: {
    purchaseHistory: 0.7,
    cartItems: 0.5,
    currentProduct: 0.3,
    browsingHistory: 0.1,
  },
};

const ensureMerchant = async (shop) => {
  if (!shop) throw new Error('shop is required');
  const merchant = await Merchant.findOne({ shop, isActive: true });
  if (!merchant) throw new Error('merchant not found');
  return merchant;
};

const getSettings = async (shop) => {
  const merchant = await ensureMerchant(shop);
  let settings = await MerchantSettings.findOne({ shop });
  if (!settings) {
    settings = await MerchantSettings.create({
      merchantId: merchant._id,
      shop,
      mode: 'ai_autopilot',
    });
  }
  return settings;
};

const saveSettings = async (shop, payload) => {
  const merchant = await ensureMerchant(shop);

  const updateData = {
    merchantId: merchant._id,
    shop,
  };

  // Only set fields that are provided
  if (payload.mode !== undefined) updateData.mode = payload.mode;
  if (payload.display !== undefined) updateData.display = payload.display;
  if (payload.filters !== undefined) updateData.filters = payload.filters;
  if (payload.weights !== undefined) updateData.weights = payload.weights;
  if (payload.design !== undefined) updateData.design = payload.design;

  // If AI autopilot mode, force best-practice values for filters & weights
  if (payload.mode === 'ai_autopilot') {
    updateData.filters = AI_AUTOPILOT_DEFAULTS.filters;
    updateData.weights = AI_AUTOPILOT_DEFAULTS.weights;
  }

  const settings = await MerchantSettings.findOneAndUpdate(
    { shop },
    updateData,
    { upsert: true, new: true }
  );
  return settings;
};

/**
 * Get recommendation-relevant settings for a merchant.
 * This is called during recommendation requests.
 */
const getRecommendationSettings = async (shop) => {
  let settings = await MerchantSettings.findOne({ shop }).lean();

  // Return defaults if no settings found
  if (!settings) {
    return {
      mode: 'ai_autopilot',
      filters: AI_AUTOPILOT_DEFAULTS.filters,
      weights: AI_AUTOPILOT_DEFAULTS.weights,
    };
  }

  return {
    mode: settings.mode || 'ai_autopilot',
    filters: settings.filters || AI_AUTOPILOT_DEFAULTS.filters,
    weights: settings.weights || AI_AUTOPILOT_DEFAULTS.weights,
    display: settings.display || {},
  };
};

const getDashboard = async (shop) => {
  const merchant = await ensureMerchant(shop);
  const match = { merchantDomain: merchant.shop };

  const agg = await RecommendationEvent.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          type: '$eventType',
        },
        count: { $sum: 1 },
        revenue: { $sum: { $ifNull: ['$orderValue', 0] } },
      },
    },
  ]);

  const metrics = { impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
  const chartMap = {};

  agg.forEach((row) => {
    const day = row._id.day;
    chartMap[day] ||= { shown: 0, clicked: 0, converted: 0, date: day };
    if (row._id.type === 'recommendation_shown') metrics.impressions += row.count, (chartMap[day].shown += row.count);
    if (row._id.type === 'recommendation_clicked') metrics.clicks += row.count, (chartMap[day].clicked += row.count);
    if (row._id.type === 'recommendation_purchased') metrics.conversions += row.count, (chartMap[day].converted += row.count);
    metrics.revenue += row.revenue || 0;
  });

  const chart = Object.values(chartMap).sort((a, b) => (a.date > b.date ? 1 : -1));

  // Top products by clicks (only include products that still exist in this merchant catalog).
  const topProducts = await RecommendationEvent.aggregate([
    { $match: { ...match, recommendationId: { $ne: null }, eventType: 'recommendation_clicked' } },
    {
      $group: {
        _id: '$recommendationId',
        clicks: { $sum: 1 },
        revenue: { $sum: { $ifNull: ['$orderValue', 0] } },
      },
    },
    { $sort: { clicks: -1 } },
    { $limit: 10 },
  ]);

  const topProductIds = topProducts.map((p) => p._id).filter(Boolean);
  const productDocs = await Product.find({
    merchantId: merchant._id,
    shopifyProductId: { $in: topProductIds },
  }).lean();
  const productMap = Object.fromEntries(productDocs.map((p) => [p.shopifyProductId, p]));

  const topProductRows = topProducts
    .map((p) => {
      const product = productMap[p._id];
      if (!product?.title) return null;

      return {
        id: p._id,
        title: product.title,
        image: typeof product.image === 'string' ? product.image.trim() : '',
        recommendedCount: p.clicks,
        ctr: '-',
        revenue: p.revenue || 0,
      };
    })
    .filter(Boolean);

  // activity: latest 20 events
  const activityRaw = await RecommendationEvent.find({ merchantDomain: merchant.shop })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const activity = activityRaw.map((a) => ({
    id: a._id,
    customer: a.customerId || 'Guest',
    product: a.recommendationId || a.productId || 'N/A',
    status: a.eventType.replace('recommendation_', ''),
    timestamp: a.createdAt,
  }));

  return { metrics, chart, topProducts: topProductRows, activityFeed: activity };
};

module.exports = {
  AI_AUTOPILOT_DEFAULTS,
  ensureMerchant,
  getSettings,
  saveSettings,
  getRecommendationSettings,
  getDashboard,
};
