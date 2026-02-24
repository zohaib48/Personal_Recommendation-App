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
const webhookParser = express.raw({ type: '*/*' });

function timingSafeCompare(a, b) {
    const left = Buffer.from(String(a || ''), 'utf8');
    const right = Buffer.from(String(b || ''), 'utf8');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Verify Shopify webhook HMAC
 */
function verifyWebhook(req, res, next) {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    const hash = crypto
        .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
        .update(rawBody)
        .digest('base64');

    if (!timingSafeCompare(hash, hmac)) {
        console.error('❌ Invalid webhook HMAC');
        return res.status(401).send('Unauthorized');
    }

    try {
        req.webhookPayload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
        return next();
    } catch (error) {
        console.error('❌ Invalid webhook JSON payload');
        return res.status(400).send('Invalid payload');
    }
}

/**
 * POST /webhooks/products/create
 */
router.post('/webhooks/products/create', webhookParser, verifyWebhook, async (req, res) => {
    try {
        const shop = req.headers['x-shopify-shop-domain'];
        const product = req.webhookPayload;

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
router.post('/webhooks/products/update', webhookParser, verifyWebhook, async (req, res) => {
    try {
        const shop = req.headers['x-shopify-shop-domain'];
        const product = req.webhookPayload;

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
router.post('/webhooks/products/delete', webhookParser, verifyWebhook, async (req, res) => {
    try {
        const shop = req.headers['x-shopify-shop-domain'];
        const productId = req.webhookPayload.id;

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
router.post('/webhooks/app/uninstalled', webhookParser, verifyWebhook, async (req, res) => {
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

/**
 * Mandatory GDPR webhooks for public apps.
 * Shopify expects these endpoints even when no customer data is stored.
 */
router.post('/webhooks/customers/data_request', webhookParser, verifyWebhook, async (req, res) => {
    const shop = req.headers['x-shopify-shop-domain'];
    const payload = req.webhookPayload || {};
    console.log(`🛡️ GDPR customers/data_request from ${shop}`, {
        customer: payload.customer?.id,
        ordersRequested: payload.orders_requested,
    });
    res.status(200).send('OK');
});

router.post('/webhooks/customers/redact', webhookParser, verifyWebhook, async (req, res) => {
    const shop = req.headers['x-shopify-shop-domain'];
    const payload = req.webhookPayload || {};
    console.log(`🛡️ GDPR customers/redact from ${shop}`, {
        customer: payload.customer?.id,
    });
    res.status(200).send('OK');
});

router.post('/webhooks/shop/redact', webhookParser, verifyWebhook, async (req, res) => {
    const shop = req.headers['x-shopify-shop-domain'];
    const payload = req.webhookPayload || {};
    console.log(`🛡️ GDPR shop/redact from ${shop}`, {
        shop_id: payload.shop_id,
    });
    res.status(200).send('OK');
});

module.exports = router;
