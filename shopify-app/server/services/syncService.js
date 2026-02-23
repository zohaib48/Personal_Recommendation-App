/**
 * Sync Service - Manages Product Synchronization
 * 
 * Orchestrates syncing products between:
 * Shopify → MongoDB → Flask
 * 
 * Handles:
 * - Initial sync on installation
 * - Incremental syncs on webhooks
 * - Full resyncs (daily cron)
 */

const Merchant = require('../models/Merchant');
const Product = require('../models/Product');
const ShopifyService = require('./shopifyService');
const flaskService = require('./flaskService');

class SyncService {
    /**
     * Full sync: Fetch all products from Shopify, save to MongoDB, register with Flask
     * @param {string} shop - Shop domain
     * @param {string} accessToken - Shopify access token
     * @returns {Promise<Object>} Sync result
     */
    static async fullSync(shop, accessToken) {
        try {
            console.log(`🔄 Starting full sync for ${shop}`);

            // 1. Find merchant in database
            const merchant = await Merchant.findOne({ shop });
            if (!merchant) {
                throw new Error(`Merchant ${shop} not found`);
            }

            // 2. Fetch all products from Shopify
            const shopifyProducts = await ShopifyService.fetchAllProducts(shop, accessToken);

            // 3. Transform and save to MongoDB
            const productsToSave = shopifyProducts.map(sp => ({
                merchantId: merchant._id,
                ...ShopifyService.transformProduct(sp),
            }));

            // Delete existing products for this merchant
            await Product.deleteMany({ merchantId: merchant._id });

            // Bulk insert new products
            const savedProducts = await Product.insertMany(productsToSave);
            console.log(`💾 Saved ${savedProducts.length} products to MongoDB`);

            // 4. Prepare products for Flask (format conversion)
            const flaskProducts = savedProducts.map(p => ({
                id: p.shopifyProductId,
                title: p.title,
                product_type: p.productType,
                tags: p.tags,
                price: p.price,
                image: p.image,
            }));

            // 5. Register with Flask
            await flaskService.registerMerchantProducts(shop, flaskProducts);

            // 6. Update last sync time
            merchant.lastSync = new Date();
            await merchant.save();

            console.log(`✅ Full sync completed for ${shop}`);
            return {
                success: true,
                productsCount: savedProducts.length,
                syncedAt: merchant.lastSync,
            };

        } catch (error) {
            console.error(`❌ Full sync failed for ${shop}:`, error.message);
            throw error;
        }
    }

    /**
     * Sync single product (for webhooks)
     * @param {string} shop - Shop domain
     * @param {Object} shopifyProduct - Shopify product object
     * @returns {Promise<Object>} Sync result
     */
    static async syncSingleProduct(shop, shopifyProduct) {
        try {
            // 1. Find merchant
            const merchant = await Merchant.findOne({ shop });
            if (!merchant) {
                throw new Error(`Merchant ${shop} not found`);
            }

            // 2. Transform product
            const productData = {
                merchantId: merchant._id,
                ...ShopifyService.transformProduct(shopifyProduct),
            };

            // 3. Upsert to MongoDB
            await Product.findOneAndUpdate(
                {
                    merchantId: merchant._id,
                    shopifyProductId: productData.shopifyProductId
                },
                productData,
                { upsert: true, new: true }
            );

            // 4. Get all products for Flask registration
            const allProducts = await Product.find({ merchantId: merchant._id });
            const flaskProducts = allProducts.map(p => ({
                id: p.shopifyProductId,
                title: p.title,
                product_type: p.productType,
                tags: p.tags,
                price: p.price,
                image: p.image,
            }));

            // 5. Re-register all products with Flask
            await flaskService.registerMerchantProducts(shop, flaskProducts);

            console.log(`✅ Synced product ${productData.shopifyProductId} for ${shop}`);
            return { success: true };

        } catch (error) {
            console.error(`❌ Single product sync failed:`, error.message);
            throw error;
        }
    }

    /**
     * Delete product from MongoDB and Flask
     * @param {string} shop - Shop domain
     * @param {string} shopifyProductId - Product ID to delete
     * @returns {Promise<Object>} Deletion result
     */
    static async deleteProduct(shop, shopifyProductId) {
        try {
            // 1. Find merchant
            const merchant = await Merchant.findOne({ shop });
            if (!merchant) {
                throw new Error(`Merchant ${shop} not found`);
            }

            const normalizedProductId = ShopifyService.normalizeProductId(shopifyProductId);

            // 2. Delete from MongoDB
            await Product.deleteOne({
                merchantId: merchant._id,
                shopifyProductId: normalizedProductId
            });

            // 3. Re-sync remaining products with Flask
            const remainingProducts = await Product.find({ merchantId: merchant._id });
            const flaskProducts = remainingProducts.map(p => ({
                id: p.shopifyProductId,
                title: p.title,
                product_type: p.productType,
                tags: p.tags,
                price: p.price,
                image: p.image,
            }));

            if (flaskProducts.length === 0) {
                await flaskService.clearMerchant(shop);
            } else {
                await flaskService.registerMerchantProducts(shop, flaskProducts);
            }

            console.log(`✅ Deleted product ${normalizedProductId} for ${shop}`);
            return { success: true };

        } catch (error) {
            console.error(`❌ Product deletion failed:`, error.message);
            throw error;
        }
    }

    /**
     * Sync all active merchants (for cron job)
     * @returns {Promise<Object>} Sync results
     */
    static async syncAllMerchants() {
        try {
            console.log('🔄 Starting sync for all merchants');

            const merchants = await Merchant.find({ isActive: true });
            const results = [];

            for (const merchant of merchants) {
                try {
                    const result = await this.fullSync(merchant.shop, merchant.accessToken);
                    results.push({ shop: merchant.shop, ...result });
                } catch (error) {
                    console.error(`Failed to sync ${merchant.shop}:`, error.message);
                    results.push({ shop: merchant.shop, success: false, error: error.message });
                }
            }

            console.log(`✅ Synced ${results.filter(r => r.success).length}/${results.length} merchants`);
            return results;

        } catch (error) {
            console.error('❌ syncAllMerchants failed:', error.message);
            throw error;
        }
    }
}

module.exports = SyncService;
