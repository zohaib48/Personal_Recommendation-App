/**
 * Flask Service - Client for Flask API Communication
 * 
 * Handles all communication with the Flask recommendation engine:
 * - Register merchant products
 * - Get recommendations
 * - Health checks
 */

const axios = require('axios');

class FlaskService {
    constructor() {
        this.baseURL = process.env.FLASK_API_URL || 'http://localhost:5000';
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000, // 30 second timeout
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Check Flask API health
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        try {
            const response = await this.client.get('/health');
            return response.data;
        } catch (error) {
            console.error('❌ Flask health check failed:', error.message);
            throw error;
        }
    }

    /**
     * Register merchant products with Flask
     * @param {string} merchantId - Merchant identifier (shop domain)
     * @param {Array} products - Array of products to register
     * @returns {Promise<Object>} Registration result
     */
    async registerMerchantProducts(merchantId, products) {
        try {
            console.log(`📤 Registering ${products.length} products for ${merchantId} with Flask`);

            const response = await this.client.post('/api/merchant/register', {
                merchant_id: merchantId,
                products: products,
            });

            console.log(`✅ Flask registration successful:`, response.data);
            return response.data;

        } catch (error) {
            console.error(`❌ Flask registration failed for ${merchantId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get product recommendations from Flask
     * @param {Object} params - Recommendation parameters
     * @returns {Promise<Object>} Recommendations
     */
    async getRecommendations(params) {
        try {
            const {
                merchantId,
                currentProductId,
                userHistory,
                userLocation,
                userPreferences,
                k = 10,
                exclude_current = true,
                exclude_viewed = false,
                exclude_purchased = true,
                merchant_settings = null
            } = params;

            const response = await this.client.post('/api/recommend', {
                merchant_id: merchantId,
                current_product_id: currentProductId,
                user_history: userHistory,
                user_location: userLocation,
                user_preferences: userPreferences,
                k: k,
                exclude_current: exclude_current,
                exclude_viewed: exclude_viewed,
                exclude_purchased: exclude_purchased,
                merchant_settings: merchant_settings
            });

            return response.data;

        } catch (error) {
            console.error('❌ Flask recommendation request failed:', error.message);
            throw error;
        }
    }

    /**
     * Get popular products from Flask
     * @param {Object} params - Parameters
     * @param {string} params.merchantId - Merchant identifier
     * @param {number} [params.k=6] - Number of products
     * @param {string} [params.userLocation] - User's geo-location (country)
     * @param {Object} [params.userPreferences] - User preferences (vegan, sustainable, price_range)
     * @returns {Promise<Object>} Popular products
     */
    async getPopular(params) {
        try {
            const { merchantId, k = 6, userLocation, userPreferences } = params;
            console.log("🚀 ~ FlaskService ~ getPopular ~ params:", params)
            const response = await this.client.post('/api/popular', {
                merchant_id: merchantId,
                k: k,
                user_location: userLocation || null,
                user_preferences: userPreferences || null,
            });

            return response.data;
        } catch (error) {
            console.error('Flask popular request failed:', error.message);
            throw error;
        }
    }

    /**
     * Clear merchant data from Flask
     * @param {string} merchantId - Merchant identifier
     * @returns {Promise<Object>} Deletion result
     */
    async clearMerchant(merchantId) {
        try {
            const response = await this.client.delete(`/api/merchant/${merchantId}`);
            return response.data;
        } catch (error) {
            console.error(`❌ Flask merchant deletion failed for ${merchantId}:`, error.message);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new FlaskService();
