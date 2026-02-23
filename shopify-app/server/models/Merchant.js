/**
 * Merchant Model - MongoDB Schema
 * 
 * Stores Shopify merchant information including:
 * - Shop domain and access token
 * - Installation and sync timestamps
 * - Active status
 */

const mongoose = require('mongoose');

const merchantSchema = new mongoose.Schema({
    shop: {
        type: String,
        required: true,
        unique: true,
    },
    accessToken: {
        type: String,
        required: true,
    },
    scope: {
        type: String,
        default: 'read_products,write_products',
    },
    installedAt: {
        type: Date,
        default: Date.now,
    },
    lastSync: {
        type: Date,
        default: null,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

// Index for faster queries
merchantSchema.index({ shop: 1, isActive: 1 });

module.exports = mongoose.model('Merchant', merchantSchema);
