/**
 * Product Model - MongoDB Schema
 * 
 * Stores product information synced from Shopify including:
 * - Shopify product details
 * - Tags, price, images
 * - Merchant relationship
 */

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    merchantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Merchant',
        required: true,
    },
    shopifyProductId: {
        type: String,
        required: true,
        index: true,
    },
    title: {
        type: String,
        required: true,
    },
    productType: {
        type: String,
        default: '',
    },
    tags: {
        type: [String],
        default: [],
    },
    price: {
        type: String,
        default: '0',
    },
    image: {
        type: String,
        default: '',
    },
    variants: {
        type: mongoose.Schema.Types.Mixed,
        default: [],
    },
    vendor: {
        type: String,
        default: '',
    },
    handle: {
        type: String,
        default: '',
    },
}, {
    timestamps: true,
});

// Compound index for unique products per merchant
productSchema.index({ merchantId: 1, shopifyProductId: 1 }, { unique: true });

// Index for product lookups
productSchema.index({ merchantId: 1, productType: 1 });

module.exports = mongoose.model('Product', productSchema);
