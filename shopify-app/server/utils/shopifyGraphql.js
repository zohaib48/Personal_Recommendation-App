const axios = require('axios');

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2026-01';

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shopifyGraphqlRequest({ shop, accessToken, query, variables = {}, timeoutMs = 30000 }) {
    if (!shop) throw new Error('shop is required');
    if (!accessToken) throw new Error('accessToken is required');
    if (!query) throw new Error('query is required');

    const url = `https://${shop}/admin/api/${API_VERSION}/graphql.json`;
    const maxAttempts = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const response = await axios.post(
                url,
                { query, variables },
                {
                    headers: {
                        'X-Shopify-Access-Token': accessToken,
                        'Content-Type': 'application/json',
                    },
                    timeout: timeoutMs,
                }
            );

            const payload = response?.data || {};
            if (Array.isArray(payload.errors) && payload.errors.length > 0) {
                const message = payload.errors.map((e) => e.message).filter(Boolean).join('; ');
                throw new Error(message || 'Shopify GraphQL request failed');
            }

            return payload.data || {};
        } catch (error) {
            lastError = error;
            const status = error?.response?.status;
            const retryable = status === 429 || (status >= 500 && status < 600);
            if (!retryable || attempt === maxAttempts) break;
            await wait(300 * attempt);
        }
    }

    throw lastError || new Error('Shopify GraphQL request failed');
}

module.exports = {
    API_VERSION,
    shopifyGraphqlRequest,
};
