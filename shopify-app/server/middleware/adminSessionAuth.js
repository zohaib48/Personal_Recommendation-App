const shopify = require('../config/shopify');

function extractBearerToken(req) {
    const header = String(req.headers?.authorization || '').trim();
    if (!header.toLowerCase().startsWith('bearer ')) return '';
    return header.slice(7).trim();
}

function extractShopFromDest(dest) {
    try {
        const url = new URL(String(dest || ''));
        return url.hostname || '';
    } catch (_error) {
        return '';
    }
}

async function authenticateAdminSession(req, res, next) {
    const enforce = process.env.ENFORCE_ADMIN_SESSION_TOKEN === 'true';
    const token = extractBearerToken(req);

    if (!token) {
        if (enforce) {
            return res.status(401).json({ error: 'Missing Shopify session token' });
        }
        return next();
    }

    try {
        const payload = await shopify.session.decodeSessionToken(token);
        const tokenShop = extractShopFromDest(payload?.dest);

        req.shopifySession = payload;
        req.authenticatedShop = tokenShop || req.query?.shop || req.body?.shop || '';

        if (!req.query.shop && req.authenticatedShop) {
            req.query.shop = req.authenticatedShop;
        }

        return next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid Shopify session token' });
    }
}

module.exports = authenticateAdminSession;
