/**
 * Recommendation Routes - Public API for Frontend
 * 
 * Handles:
/**
 * Recommendation Routes - Public API for Frontend
 * 
 * Handles:
 * - GET /api/recommend - Get recommendations
 * - POST /api/track/* - Track user interactions
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Product = require('../models/Product');
const Merchant = require('../models/Merchant');
const RecommendationEvent = require('../models/RecommendationEvent');
const flaskService = require('../services/flaskService');
const { getRecommendationSettings } = require('../services/settingsService');

/**
 * Normalize a product ID to GID format (gid://shopify/Product/XXXXX).
 * The widget sends numeric IDs, but Flask stores products with GID keys.
 */
function toGid(id) {
    if (!id) return id;
    const s = String(id);
    return s.startsWith('gid://') ? s : `gid://shopify/Product/${s}`;
}

function buildAppProxySignatureMessage(query) {
    const pairs = Object.keys(query || {})
        .filter((key) => key !== 'signature')
        .sort()
        .map((key) => {
            const rawValue = query[key];
            const values = Array.isArray(rawValue) ? rawValue : [rawValue];
            return `${key}=${values.map((v) => String(v ?? '')).join(',')}`;
        });
    return pairs.join('');
}

function isValidAppProxySignature(query) {
    const signature = String(query?.signature || '').trim().toLowerCase();
    const secret = process.env.SHOPIFY_API_SECRET;
    if (!signature || !secret) return false;

    const message = buildAppProxySignatureMessage(query);
    const digest = crypto
        .createHmac('sha256', secret)
        .update(message, 'utf8')
        .digest('hex')
        .toLowerCase();

    const expected = Buffer.from(digest, 'utf8');
    const received = Buffer.from(signature, 'utf8');
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function enforceAppProxySignature(req, res, next) {
    const shouldEnforce = process.env.NODE_ENV === 'production' || Boolean(req.query?.signature);
    if (!shouldEnforce) return next();

    if (!isValidAppProxySignature(req.query)) {
        return res.status(401).json({
            success: false,
            error: 'Invalid app proxy signature',
        });
    }

    return next();
}

/**
 * GET /api/recommend
 * Get product recommendations
 * 
 * Query params:
 * - shop: merchant shop domain
 * - productId: current product ID
 * - customerId: user ID (optional)
 * - location: user location (optional)
 * - k: number of recommendations (optional, default 10)
 */
router.get('/api/recommend', enforceAppProxySignature, async (req, res) => {
    try {
        const {
            productId,
            customerId,
            location,
            geoLocation,
            preferences,
            history,
            cart,
            k = 10,
        } = req.query;
        const shop = req.query.shop || req.headers['x-shopify-shop-domain'];

        // Clean up history - extract "Live" history from request (localStorage from guest)
        let liveHistory = [];
        if (history) {
            try {
                const parsed = JSON.parse(history);
                if (Array.isArray(parsed)) liveHistory = parsed.map(toGid);
            } catch (e) {
                console.warn('⚠️ Failed to parse live history:', e.message);
            }
        }

        // Pivot Logic: If on homepage (no productId), optionally use most recent from history as a HINT, 
        // but don't force it or the AI will lock to that single category and ignore the cart.
        let effectiveProductId = productId ? toGid(productId) : null;

        // If we have no productId AND no pivot, we still allow the request if we have history or cart
        // because common interests (purchased/cart) can still drive a global recommendation.
        if (!shop) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: shop',
            });
        }

        // Find merchant
        const merchant = await Merchant.findOne({ shop, isActive: true });
        if (!merchant) {
            return res.status(404).json({
                success: false,
                error: 'Merchant not found',
            });
        }

        // Load merchant-specific recommendation settings
        const merchSettings = await getRecommendationSettings(shop);

        // Get user history if customerId provided
        let userHistory = { viewed: [], added_to_cart: [], purchased: [] };

        // 2. Merge with "Live" history & Active Cart
        if (liveHistory.length > 0) {
            userHistory.viewed = [...new Set([...liveHistory, ...userHistory.viewed])].slice(0, 10);
        }

        if (cart) {
            try {
                const cartIds = JSON.parse(cart);
                if (Array.isArray(cartIds)) {
                    const normalizedCart = cartIds.map(toGid);
                    userHistory.added_to_cart = [...new Set([...normalizedCart, ...userHistory.added_to_cart])].slice(0, 5);
                }
            } catch (e) {
                console.warn('⚠️ Failed to parse cart items:', e.message);
            }
        }

        // Cart-page anchor: when no current product exists, use first cart item as pivot.
        // This improves recommendation relevance for mixed catalog pages like /cart.
        if (!effectiveProductId && userHistory.added_to_cart.length > 0) {
            effectiveProductId = userHistory.added_to_cart[0];
        }

        // Final cleanup
        if (userHistory.viewed.length === 0 && userHistory.added_to_cart.length === 0 && userHistory.purchased.length === 0) {
            userHistory = null;
        }

        // Parse user preferences if provided
        let userPreferences = null;
        if (preferences) {
            try { userPreferences = JSON.parse(preferences); } catch (e) { }
        }

        // Exclude Logic: driven by merchant settings
        const excludeCurrent = productId ? true : false;
        const excludeViewed = merchSettings.filters?.excludeViewed ?? false;
        const excludePurchased = merchSettings.filters?.excludePurchased ?? true;

        // Call Flask API with merchant settings
        const recommendations = await flaskService.getRecommendations({
            merchantId: shop,
            currentProductId: effectiveProductId,
            userHistory,
            userLocation: geoLocation || null,
            userPreferences,
            k: parseInt(k, 10),
            exclude_current: excludeCurrent,
            exclude_viewed: excludeViewed,
            exclude_purchased: excludePurchased,
            merchant_settings: {
                mode: merchSettings.mode,
                filters: merchSettings.filters,
                weights: merchSettings.weights,
            },
        });

        // Homepage boost: inject recently viewed products at the top
        // so they appear alongside the AI-recommended items
        if (!productId && liveHistory.length > 0 && recommendations && recommendations.recommendations) {
            const flaskRecs = recommendations.recommendations;
            const existingIds = new Set(flaskRecs.map(r => r.shopify_product_id));

            // Find viewed products that are NOT already in the results
            const missingViewedGids = liveHistory.filter(gid => !existingIds.has(gid));

            if (missingViewedGids.length > 0) {
                // Fetch from MongoDB to get product details
                const viewedProducts = await Product.find({
                    merchantId: merchant._id,
                    shopifyProductId: { $in: missingViewedGids },
                });

                const injected = viewedProducts.map(p => ({
                    shopify_product_id: p.shopifyProductId,
                    title: p.title || '',
                    category: p.productType || '',
                    price: p.price || '0',
                    image: p.image || '',
                    tags: p.tags || [],
                    score: 1.0,
                    reason: 'Recently viewed',
                }));

                // Prepend viewed products, then fill with AI recs, trim to k
                const merged = [...injected, ...flaskRecs];
                recommendations.recommendations = merged.slice(0, parseInt(k, 10));
                recommendations.count = recommendations.recommendations.length;
            }
        }
        // Enrich recommendations with handle from MongoDB for product URLs
        if (recommendations && recommendations.recommendations) {
            const recGids = recommendations.recommendations.map(r => r.shopify_product_id);
            const productDocs = await Product.find({
                merchantId: merchant._id,
                shopifyProductId: { $in: recGids },
            }).lean();
            const handleMap = Object.fromEntries(
                productDocs.map(p => [p.shopifyProductId, p.handle || ''])
            );
            recommendations.recommendations = recommendations.recommendations.map(r => ({
                ...r,
                handle: handleMap[r.shopify_product_id] || '',
                product_url: handleMap[r.shopify_product_id]
                    ? `/products/${handleMap[r.shopify_product_id]}`
                    : '',
            }));
        }

        res.json(recommendations);

    } catch (error) {
        console.error('❌ Recommendation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get recommendations',
            details: error.message,
        });
    }
});

/**
 * GET /api/popular
 * Get popular products (fallback recommendations)
 *
 * Query params:
 * - shop: merchant shop domain
 * - k: number of products (optional, default 6)
 */
router.get('/api/popular', enforceAppProxySignature, async (req, res) => {
    try {
        const { geoLocation, preferences, k = 6 } = req.query;
        const shop = req.query.shop || req.headers['x-shopify-shop-domain'];

        if (!shop) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: shop',
            });
        }

        const merchant = await Merchant.findOne({ shop, isActive: true });
        if (!merchant) {
            return res.status(404).json({
                success: false,
                error: 'Merchant not found',
            });
        }

        // Parse user preferences if provided
        let userPreferences = null;
        if (preferences) {
            try { userPreferences = JSON.parse(preferences); } catch (e) { /* ignore */ }
        }

        const popular = await flaskService.getPopular({
            merchantId: shop,
            userLocation: geoLocation || null,
            userPreferences,
            k: parseInt(k, 10),
        });

        // Enrich popular results with product handles for valid storefront URLs.
        if (popular && Array.isArray(popular.products) && popular.products.length > 0) {
            const popularGids = popular.products.map((p) => p.shopify_product_id).filter(Boolean);
            if (popularGids.length > 0) {
                const productDocs = await Product.find({
                    merchantId: merchant._id,
                    shopifyProductId: { $in: popularGids },
                }).lean();
                const handleMap = Object.fromEntries(
                    productDocs.map((p) => [p.shopifyProductId, p.handle || ''])
                );

                popular.products = popular.products.map((p) => {
                    const handle = handleMap[p.shopify_product_id] || '';
                    return {
                        ...p,
                        handle,
                        product_url: handle ? `/products/${handle}` : '',
                    };
                });
            }
        }

        res.json(popular);
    } catch (error) {
        console.error('Popular recommendations error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get popular recommendations',
            details: error.message,
        });
    }
});

/**
 * POST /api/track/event
 * Track recommendation events for analytics
 */
router.post('/api/track/event', enforceAppProxySignature, express.json(), async (req, res) => {
    try {
        const {
            event_type,
            merchant_id,
            customer_id,
            product_id,
            recommendation_id,
            recommendations,
            location,
            position,
            order_value,
            timestamp,
            metadata,
        } = req.body;

        if (!event_type || !merchant_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: event_type, merchant_id',
            });
        }

        const merchant = await Merchant.findOne({ shop: merchant_id });
        if (!merchant) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        await RecommendationEvent.create({
            merchantId: merchant._id,
            merchantDomain: merchant.shop,
            customerId: customer_id,
            eventType: event_type,
            productId: product_id,
            recommendationId: recommendation_id,
            recommendations: Array.isArray(recommendations) ? recommendations : [],
            location,
            position,
            orderValue: order_value,
            metadata,
            createdAt: timestamp ? new Date(timestamp) : new Date(),
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Track event error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
