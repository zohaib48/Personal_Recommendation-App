/**
 * Authentication Routes - Shopify OAuth Flow
 * 
 * Handles:
 * - OAuth initiation
 * - OAuth callback
 * - Installation flow
 */

const express = require('express');
const router = express.Router();
const Merchant = require('../models/Merchant');
const SyncService = require('../services/syncService');
const WebhookService = require('../services/webhookService');

/**
 * GET /auth
 * Initiate OAuth flow
 */
router.get('/auth', async (req, res) => {
    try {
        console.log('========== AUTH REQUEST RECEIVED ==========');
        console.log('Query params:', req.query);
        console.log('Headers:', JSON.stringify(req.headers, null, 2));

        const { shop } = req.query;

        if (!shop) {
            console.log('❌ Missing shop parameter');
            return res.status(400).json({ error: 'Missing shop parameter' });
        }

        // Force re-auth to refresh token if requested
        // const existing = await Merchant.findOne({ shop, isActive: true });
        // if (existing) {
        //     return res.redirect('/app');
        // }

        console.log('✅ Shop:', shop);
        console.log('✅ SHOPIFY_API_KEY:', process.env.SHOPIFY_API_KEY);
        console.log('✅ SHOPIFY_SCOPES:', process.env.SHOPIFY_SCOPES);
        console.log('✅ SHOPIFY_HOST:', process.env.SHOPIFY_HOST);

        const redirectUri = `${process.env.SHOPIFY_HOST}/auth/callback`;
        const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=${process.env.SHOPIFY_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}`;

        console.log('🔗 Redirect URI:', redirectUri);
        console.log('🔗 Full Auth URL:', authUrl);
        console.log('============================================');

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
        const { shop, code } = req.query;

        if (!shop || !code) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // TODO: Validate HMAC for security

        // Exchange code for access token
        const axios = require('axios');
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

        // Redirect to app dashboard after install
        res.redirect(`${process.env.SHOPIFY_HOST}/app`);

    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).json({ error: 'Installation failed', details: error.message });
    }
});

module.exports = router;

