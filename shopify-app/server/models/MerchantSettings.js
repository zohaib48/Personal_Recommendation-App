const mongoose = require('mongoose');

const merchantSettingsSchema = new mongoose.Schema(
  {
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', index: true, required: true },
    shop: { type: String, required: true },

    // 'ai_autopilot' = best-practice defaults, 'manual' = merchant controls everything
    mode: { type: String, enum: ['ai_autopilot', 'manual'], default: 'ai_autopilot' },

    // --- Display Settings ---
    display: {
      productPageEnabled: { type: Boolean, default: true },
      cartPageEnabled: { type: Boolean, default: true },
      productTitle: { type: String, default: 'You Might Also Like' },
      cartTitle: { type: String, default: 'Complete Your Look' },
      productCount: { type: Number, default: 4 },
      cartCount: { type: Number, default: 3 },
      layout: { type: String, enum: ['grid', 'carousel', 'list'], default: 'grid' },
    },

    // --- Filter Toggles ---
    filters: {
      priceProximity: {
        enabled: { type: Boolean, default: true },
        range: { type: Number, default: 0.30 },   // ±30%
      },
      tagBoost: {
        enabled: { type: Boolean, default: true },
        weight: { type: Number, default: 0.15 },
      },
      locationFilter: {
        enabled: { type: Boolean, default: true },
      },
      ethicalFilter: {
        enabled: { type: Boolean, default: false },
        vegan: { type: Boolean, default: false },
        sustainable: { type: Boolean, default: false },
      },
      excludeViewed: { type: Boolean, default: false },
      excludePurchased: { type: Boolean, default: true },
      sameCategoryOnly: { type: Boolean, default: true },
    },

    // --- Signal Weights (0–1) ---
    weights: {
      purchaseHistory: { type: Number, default: 0.7 },
      cartItems: { type: Number, default: 0.5 },
      currentProduct: { type: Number, default: 0.3 },
      browsingHistory: { type: Number, default: 0.1 },
    },

    // --- Widget Design ---
    design: {
      themeMode: { type: String, enum: ['auto', 'custom'], default: 'auto' },
      primaryColor: { type: String, default: '#000000' },
      buttonStyle: { type: String, enum: ['rounded', 'square'], default: 'rounded' },
    },
  },
  { timestamps: true }
);

merchantSettingsSchema.index({ shop: 1 }, { unique: true });

module.exports = mongoose.model('MerchantSettings', merchantSettingsSchema);
