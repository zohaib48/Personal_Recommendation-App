/**
 * Authentication Routes - Shopify OAuth Flow
 *
 * Handles:
 * - OAuth initiation
 * - OAuth callback
 * - Installation flow
 */

const crypto = require('crypto');
const express = require('express');
const axios = require('axios');
const router = express.Router();
const Merchant = require('../models/Merchant');
const SyncService = require('../services/syncService');
const WebhookService = require('../services/webhookService');

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStateStore = new Map();

function isValidShopDomain(shop) {
    return typeof shop === 'string' && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

function buildAuthHmacMessage(query) {
    const filtered = {};
    Object.keys(query || {}).forEach((key) => {
        if (key === 'hmac' || key === 'signature') return;
        const value = query[key];
        if (Array.isArray(value)) {
            filtered[key] = value.join(',');
        } else {
            filtered[key] = String(value);
        }
    });

    return Object.keys(filtered)
        .sort()
        .map((key) => `${key}=${filtered[key]}`)
        .join('&');
}

function verifyOAuthHmac(query, secret) {
    const receivedHmac = String(query?.hmac || '');
    if (!receivedHmac || !secret) return false;

    const message = buildAuthHmacMessage(query);
    const digest = crypto.createHmac('sha256', secret).update(message, 'utf8').digest('hex');

    const a = Buffer.from(digest, 'utf8');
    const b = Buffer.from(receivedHmac, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function mintOAuthState(shop) {
    const state = crypto.randomBytes(16).toString('hex');
    oauthStateStore.set(state, {
        shop,
        expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    });
    return state;
}

function consumeOAuthState(state, shop) {
    const record = oauthStateStore.get(state);
    if (!record) return false;
    oauthStateStore.delete(state);

    if (record.expiresAt < Date.now()) return false;
    return record.shop === shop;
}

/**
 * GET /auth
 * Initiate OAuth flow
 */
router.get('/auth', async (req, res) => {
    try {
        const { shop } = req.query;

        if (!isValidShopDomain(shop)) {
            return res.status(400).json({ error: 'Invalid or missing shop parameter' });
        }

        const state = mintOAuthState(shop);
        const redirectUri = `${process.env.SHOPIFY_HOST}/auth/callback`;
        const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=${process.env.SHOPIFY_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

        res.redirect(authUrl);

    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

/**
 * GET /auth/callback
 * OAuth callback - Exchange code for access token
 */
router.get('/auth/callback', async (req, res) => {
    try {
        const { shop, code, state } = req.query;

        if (!isValidShopDomain(shop) || !code || !state) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        if (!consumeOAuthState(String(state), String(shop))) {
            return res.status(400).json({ error: 'Invalid or expired OAuth state' });
        }

        if (!verifyOAuthHmac(req.query, process.env.SHOPIFY_API_SECRET)) {
            return res.status(401).json({ error: 'Invalid OAuth HMAC' });
        }

        // Exchange code for access token
        const tokenResponse = await axios.post(`https://${shop}/admin/oauth/access_token`, {
            client_id: process.env.SHOPIFY_API_KEY,
            client_secret: process.env.SHOPIFY_API_SECRET,
            code: code,
        });

        const { access_token, scope } = tokenResponse.data;

        // Save merchant to database
        let merchant = await Merchant.findOne({ shop });

        if (merchant) {
            merchant.accessToken = access_token;
            merchant.scope = scope;
            merchant.isActive = true;
        } else {
            merchant = new Merchant({
                shop,
                accessToken: access_token,
                scope,
            });
        }

        await merchant.save();
        console.log(`✅ Merchant ${shop} installed successfully`);

        // Ensure webhook subscriptions are registered to current app URL
        try {
            await WebhookService.registerWebhooks(shop, access_token);
        } catch (webhookError) {
            console.warn(`⚠️  Webhook registration failed for ${shop}: ${webhookError.message}`);
        }

        // Trigger initial product sync
        SyncService.fullSync(shop, access_token)
            .then(() => console.log(` Initial sync completed for ${shop}`))
            .catch(err => console.error(`❌ Initial sync failed for ${shop}:`, err.message));

        // Redirect to embedded app surface in Shopify Admin.
        const adminAppUrl = `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;
        res.redirect(adminAppUrl);

    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).json({ error: 'Installation failed', details: error.message });
    }
});

module.exports = router;

