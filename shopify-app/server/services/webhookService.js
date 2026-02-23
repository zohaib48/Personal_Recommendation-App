/**
 * Webhook Service - Ensures Shopify webhook subscriptions exist and are current.
 *
 * This protects sync reliability when:
 * - A merchant installs for the first time
 * - The app URL/tunnel changes
 * - Existing webhook addresses become stale
 */

const axios = require('axios');

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2024-01';

const WEBHOOK_SUBSCRIPTIONS = [
    { topic: 'products/create', path: '/webhooks/products/create' },
    { topic: 'products/update', path: '/webhooks/products/update' },
    { topic: 'products/delete', path: '/webhooks/products/delete' },
    { topic: 'app/uninstalled', path: '/webhooks/app/uninstalled' },
];

class WebhookService {
    /**
     * Ensure all required webhooks are registered with current callback URLs.
     * @param {string} shop
     * @param {string} accessToken
     * @returns {Promise<{created: number, removed: number, unchanged: number}>}
     */
    static async registerWebhooks(shop, accessToken) {
        if (!shop) throw new Error('shop is required');
        if (!accessToken) throw new Error('accessToken is required');

        const host = this._normalizeHost(process.env.SHOPIFY_HOST);
        if (!host) {
            throw new Error('SHOPIFY_HOST is required to register webhooks');
        }

        const client = axios.create({
            baseURL: `https://${shop}/admin/api/${API_VERSION}`,
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });

        const { data } = await client.get('/webhooks.json', { params: { limit: 250 } });
        const existing = Array.isArray(data?.webhooks) ? data.webhooks : [];

        let created = 0;
        let removed = 0;
        let unchanged = 0;

        for (const sub of WEBHOOK_SUBSCRIPTIONS) {
            const desiredAddress = `${host}${sub.path}`;
            const topicWebhooks = existing.filter(w => w.topic === sub.topic);

            const matches = topicWebhooks.filter(
                w => this._normalizeAddress(w.address) === desiredAddress
            );
            const stale = topicWebhooks.filter(
                w => this._normalizeAddress(w.address) !== desiredAddress
            );

            for (const webhook of stale) {
                await client.delete(`/webhooks/${webhook.id}.json`);
                removed += 1;
            }

            if (matches.length > 0) {
                unchanged += 1;
                continue;
            }

            await client.post('/webhooks.json', {
                webhook: {
                    topic: sub.topic,
                    address: desiredAddress,
                    format: 'json',
                },
            });
            created += 1;
        }

        console.log(
            `🔔 Webhooks ensured for ${shop}: created=${created}, removed=${removed}, unchanged=${unchanged}`
        );

        return { created, removed, unchanged };
    }

    /**
     * @param {string|undefined} host
     * @returns {string}
     */
    static _normalizeHost(host) {
        return String(host || '').trim().replace(/\/+$/, '');
    }

    /**
     * @param {string|undefined} address
     * @returns {string}
     */
    static _normalizeAddress(address) {
        return String(address || '').trim().replace(/\/+$/, '');
    }
}

module.exports = WebhookService;
