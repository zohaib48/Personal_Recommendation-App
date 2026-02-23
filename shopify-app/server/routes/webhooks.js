/**
 * Webhook Routes - Handle Shopify Webhooks
 * 
 * Handles:
 * - products/create
 * - products/update
 * - products/delete
 * - app/uninstalled
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Merchant = require('../models/Merchant');
const SyncService = require('../services/syncService');
const flaskService = require('../services/flaskService');

/**
 * Verify Shopify webhook HMAC
 */
function verifyWebhook(req, res, next) {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const body = JSON.stringify(req.body);

    const hash = crypto
        .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
        .update(body, 'utf8')
        .digest('base64');

    if (hash === hmac) {
        next();
    } else {
        console.error('❌ Invalid webhook HMAC');
        res.status(401).send('Unauthorized');
    }
}

/**
 * POST /webhooks/products/create
 */
router.post('/webhooks/products/create', express.json(), async (req, res) => {
    try {
        const shop = req.headers['x-shopify-shop-domain'];
        const product = req.body;

        console.log(`📦 Product created webhook from ${shop}: ${product.title}`);

        await SyncService.syncSingleProduct(shop, product);

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error (create):', error);
        res.status(500).send('Error');
    }
});

/**
 * POST /webhooks/products/update
 */
router.post('/webhooks/products/update', express.json(), async (req, res) => {
    try {
        const shop = req.headers['x-shopify-shop-domain'];
        const product = req.body;

        console.log(`🔄 Product updated webhook from ${shop}: ${product.title}`);

        await SyncService.syncSingleProduct(shop, product);

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error (update):', error);
        res.status(500).send('Error');
    }
});

/**
 * POST /webhooks/products/delete
 */
router.post('/webhooks/products/delete', express.json(), async (req, res) => {
    try {
        const shop = req.headers['x-shopify-shop-domain'];
        const productId = req.body.id;

        console.log(`🗑️  Product deleted webhook from ${shop}: ${productId}`);

        await SyncService.deleteProduct(shop, productId);

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error (delete):', error);
        res.status(500).send('Error');
    }
});

/**
 * POST /webhooks/app/uninstalled
 */
router.post('/webhooks/app/uninstalled', express.json(), async (req, res) => {
    try {
        const shop = req.headers['x-shopify-shop-domain'];

        console.log(`❌ App uninstalled from ${shop}`);

        // Mark merchant as inactive
        await Merchant.findOneAndUpdate(
            { shop },
            { isActive: false }
        );

        // Clear from Flask
        await flaskService.clearMerchant(shop);

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error (uninstall):', error);
        res.status(500).send('Error');
    }
});

module.exports = router;
