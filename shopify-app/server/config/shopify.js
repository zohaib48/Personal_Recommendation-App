/**
 * Shopify API Configuration
 * 
 * Sets up Shopify API client with credentials and scopes.
 */

const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SHOPIFY_SCOPES?.split(',') || ['read_products', 'write_products', 'write_app_proxy'],
    hostName: process.env.SHOPIFY_HOST?.replace(/https?:\/\//, '') || 'localhost:3000',
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: true,
});

module.exports = shopify;
