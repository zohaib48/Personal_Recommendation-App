/**
 * Shopify Service - Wrapper for Shopify API Operations
 * 
 * Handles all Shopify API interactions:
 * - Fetch products from Shopify
 * - Bulk operations
 * - Error handling and rate limiting
 */

const { shopifyGraphqlRequest } = require('../utils/shopifyGraphql');

const PRODUCTS_QUERY = `
query FetchProducts($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    edges {
      node {
        id
        title
        productType
        tags
        vendor
        handle
        featuredImage {
          url
        }
        variants(first: 100) {
          edges {
            node {
              id
              title
              price
              compareAtPrice
              sku
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

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
            let cursor = null;

            while (hasNextPage) {
                const data = await shopifyGraphqlRequest({
                    shop,
                    accessToken,
                    query: PRODUCTS_QUERY,
                    variables: {
                        first: 250,
                        after: cursor,
                    },
                });

                const connection = data?.products;
                const edges = Array.isArray(connection?.edges) ? connection.edges : [];
                products.push(...edges.map((edge) => edge.node));

                hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
                cursor = connection?.pageInfo?.endCursor || null;

                if (hasNextPage) {
                    await this._delay(200);
                }
            }

            console.log(`✅ Fetched ${products.length} products from ${shop} via GraphQL`);
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
        const rawTags = shopifyProduct?.tags;
        const tags = Array.isArray(rawTags)
            ? rawTags.map((t) => String(t).trim()).filter(Boolean)
            : String(rawTags || '')
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);

        const graphQlVariants = Array.isArray(shopifyProduct?.variants?.edges)
            ? shopifyProduct.variants.edges
                .map((edge) => edge?.node)
                .filter(Boolean)
                .map((variant) => ({
                    id: variant.id,
                    title: variant.title || '',
                    price: variant.price || '0',
                    compare_at_price: variant.compareAtPrice || null,
                    sku: variant.sku || '',
                }))
            : [];

        const variants = graphQlVariants.length > 0
            ? graphQlVariants
            : (Array.isArray(shopifyProduct?.variants) ? shopifyProduct.variants : []);

        const firstVariant = variants[0] || {};
        const productType = shopifyProduct.productType || shopifyProduct.product_type || '';
        const image =
            shopifyProduct?.featuredImage?.url ||
            shopifyProduct?.image?.src ||
            shopifyProduct?.images?.[0]?.src ||
            '';

        return {
            shopifyProductId: this.normalizeProductId(shopifyProduct.id),
            title: shopifyProduct.title || '',
            productType,
            tags,
            price: firstVariant.price || '0',
            image,
            variants,
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
