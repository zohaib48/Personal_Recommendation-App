/**
 * Webhook Service - Ensures Shopify webhook subscriptions exist and are current.
 *
 * This protects sync reliability when:
 * - A merchant installs for the first time
 * - The app URL/tunnel changes
 * - Existing webhook addresses become stale
 */

const { shopifyGraphqlRequest } = require('../utils/shopifyGraphql');

const WEBHOOK_SUBSCRIPTIONS = [
    { topic: 'PRODUCTS_CREATE', path: '/webhooks/products/create' },
    { topic: 'PRODUCTS_UPDATE', path: '/webhooks/products/update' },
    { topic: 'PRODUCTS_DELETE', path: '/webhooks/products/delete' },
    { topic: 'APP_UNINSTALLED', path: '/webhooks/app/uninstalled' },
    { topic: 'CUSTOMERS_DATA_REQUEST', path: '/webhooks/customers/data_request' },
    { topic: 'CUSTOMERS_REDACT', path: '/webhooks/customers/redact' },
    { topic: 'SHOP_REDACT', path: '/webhooks/shop/redact' },
];

const WEBHOOK_LIST_QUERY = `
query GetWebhookSubscriptions($first: Int!, $after: String) {
  webhookSubscriptions(first: $first, after: $after) {
    edges {
      node {
        id
        topic
        endpoint {
          __typename
          ... on WebhookHttpEndpoint {
            callbackUrl
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

const WEBHOOK_CREATE_MUTATION = `
mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
  webhookSubscriptionCreate(
    topic: $topic
    webhookSubscription: {callbackUrl: $callbackUrl, format: JSON}
  ) {
    webhookSubscription {
      id
    }
    userErrors {
      field
      message
    }
  }
}
`;

const WEBHOOK_DELETE_MUTATION = `
mutation DeleteWebhook($id: ID!) {
  webhookSubscriptionDelete(id: $id) {
    deletedWebhookSubscriptionId
    userErrors {
      field
      message
    }
  }
}
`;

function toErrorMessage(userErrors, fallback) {
    const messages = (Array.isArray(userErrors) ? userErrors : [])
        .map((entry) => entry?.message)
        .filter(Boolean);
    return messages.length ? messages.join('; ') : fallback;
}

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

        const existing = await this._listWebhooks(shop, accessToken);

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
                await this._deleteWebhook(shop, accessToken, webhook.id);
                removed += 1;
            }

            if (matches.length > 0) {
                // Keep a single matching subscription and delete duplicate copies.
                for (let i = 1; i < matches.length; i += 1) {
                    await this._deleteWebhook(shop, accessToken, matches[i].id);
                    removed += 1;
                }
                unchanged += 1;
                continue;
            }

            await this._createWebhook(shop, accessToken, sub.topic, desiredAddress);
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

    static async _listWebhooks(shop, accessToken) {
        const subscriptions = [];
        let hasNextPage = true;
        let cursor = null;

        while (hasNextPage) {
            const data = await shopifyGraphqlRequest({
                shop,
                accessToken,
                query: WEBHOOK_LIST_QUERY,
                variables: {
                    first: 250,
                    after: cursor,
                },
            });

            const connection = data?.webhookSubscriptions;
            const edges = Array.isArray(connection?.edges) ? connection.edges : [];
            edges.forEach((edge) => {
                const node = edge?.node;
                const callbackUrl = node?.endpoint?.callbackUrl;
                if (!node?.id || !node?.topic || !callbackUrl) return;
                subscriptions.push({
                    id: node.id,
                    topic: node.topic,
                    address: callbackUrl,
                });
            });

            hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
            cursor = connection?.pageInfo?.endCursor || null;
        }

        return subscriptions;
    }

    static async _createWebhook(shop, accessToken, topic, callbackUrl) {
        const data = await shopifyGraphqlRequest({
            shop,
            accessToken,
            query: WEBHOOK_CREATE_MUTATION,
            variables: { topic, callbackUrl },
        });

        const result = data?.webhookSubscriptionCreate;
        const userErrors = result?.userErrors || [];
        if (userErrors.length > 0) {
            throw new Error(toErrorMessage(userErrors, `Failed to create webhook for topic ${topic}`));
        }
    }

    static async _deleteWebhook(shop, accessToken, id) {
        const data = await shopifyGraphqlRequest({
            shop,
            accessToken,
            query: WEBHOOK_DELETE_MUTATION,
            variables: { id },
        });

        const result = data?.webhookSubscriptionDelete;
        const userErrors = result?.userErrors || [];
        if (userErrors.length > 0) {
            throw new Error(toErrorMessage(userErrors, `Failed to delete webhook ${id}`));
        }
    }
}

module.exports = WebhookService;
