const mongoose = require('mongoose');

const RecommendationEventSchema = new mongoose.Schema(
  {
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', index: true },
    merchantDomain: { type: String, index: true },
    customerId: { type: String, index: true },
    eventType: { type: String, index: true, required: true },
    productId: { type: String },
    recommendationId: { type: String },
    recommendations: [{ type: String }],
    location: { type: String },
    position: { type: Number },
    orderValue: { type: Number },
    metadata: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RecommendationEvent', RecommendationEventSchema);
