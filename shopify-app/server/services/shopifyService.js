/**
 * Shopify Service - Wrapper for Shopify API Operations
 * 
 * Handles all Shopify API interactions:
 * - Fetch products from Shopify
 * - Bulk operations
 * - Error handling and rate limiting
 */

const axios = require('axios');

class ShopifyService {
    /**
     * Normalize any Shopify product ID to GraphQL GID format.
     * @param {string|number} productId
     * @returns {string}
     */
    static normalizeProductId(productId) {
        const raw = String(productId || '').trim();
        if (!raw) return '';
        if (raw.startsWith('gid://shopify/Product/')) {
            return raw;
        }
        return `gid://shopify/Product/${raw}`;
    }

    /**
     * Fetch all products from a Shopify store
     * @param {string} shop - Shop domain (e.g., "store.myshopify.com")
     * @param {string} accessToken - Shopify access token
     * @returns {Promise<Array>} Array of products
     */
    static async fetchAllProducts(shop, accessToken) {
        try {
            const products = [];
            let hasNextPage = true;
            let pageInfo = null;

            while (hasNextPage) {
                const url = `https://${shop}/admin/api/2024-01/products.json`;
                const params = {
                    limit: 250, // Max allowed by Shopify
                };

                if (pageInfo) {
                    params.page_info = pageInfo;
                }

                const response = await axios.get(url, {
                    headers: {
                        'X-Shopify-Access-Token': accessToken,
                    },
                    params,
                });

                const fetchedProducts = response.data.products || [];
                products.push(...fetchedProducts);

                // Check for pagination
                const linkHeader = response.headers.link;
                if (linkHeader && linkHeader.includes('rel="next"')) {
                    // Extract page_info from link header
                    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
                    if (nextMatch) {
                        const nextUrl = new URL(nextMatch[1]);
                        pageInfo = nextUrl.searchParams.get('page_info');
                    } else {
                        hasNextPage = false;
                    }
                } else {
                    hasNextPage = false;
                }

                // Rate limiting delay (Shopify allows 2 requests/second)
                await this._delay(500);
            }

            console.log(`✅ Fetched ${products.length} products from ${shop}`);
            return products;

        } catch (error) {
            console.error(`❌ Error fetching products from ${shop}:`, error.message);
            throw error;
        }
    }

    /**
     * Transform Shopify product to our schema format
     * @param {Object} shopifyProduct - Raw Shopify product
     * @returns {Object} Transformed product
     */
    static transformProduct(shopifyProduct) {
        return {
            shopifyProductId: this.normalizeProductId(shopifyProduct.id),
            title: shopifyProduct.title || '',
            productType: shopifyProduct.product_type || '',
            tags: shopifyProduct.tags ? shopifyProduct.tags.split(',').map(t => t.trim()) : [],
            price: shopifyProduct.variants?.[0]?.price || '0',
            image: shopifyProduct.image?.src || shopifyProduct.images?.[0]?.src || '',
            variants: shopifyProduct.variants || [],
            vendor: shopifyProduct.vendor || '',
            handle: shopifyProduct.handle || '',
        };
    }

    /**
     * Delay utility for rate limiting
     * @param {number} ms - Milliseconds to delay
     */
    static _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ShopifyService;
