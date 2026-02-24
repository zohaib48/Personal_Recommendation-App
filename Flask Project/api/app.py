"""
Flask API for Shopify AI Recommendation System.

This module provides the REST API endpoints:
- GET /health - Health check
- POST /api/merchant/register - Register merchant products
- POST /api/recommend - Get personalized recommendations
- POST /api/popular - Get popular products (cold start)

The API is designed to be called from a Shopify Remix app (Node.js)
to provide AI-powered product recommendations.
"""

import logging
import time
from typing import Dict, Any, Optional
from functools import wraps

from flask import Flask, request, jsonify
from flask_cors import CORS

# Import recommendation components
from src.recommender import get_recommender
from src.model_loader import get_model_loader
from config import API_CONFIG, LOGGING_CONFIG, DEFAULT_K, MAX_K

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOGGING_CONFIG["level"], logging.INFO),
    format=LOGGING_CONFIG["format"]
)
logger = logging.getLogger(__name__)


def create_app() -> Flask:
    """
    Create and configure the Flask application.
    
    Returns:
        Configured Flask app instance
    """
    app = Flask(__name__)
    
    # Enable CORS for all routes (required for Shopify Remix app)
    CORS(app, resources={
        r"/api/*": {
            "origins": "*",
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })
    
    # Initialize model loader and recommender
    @app.before_request
    def initialize_on_first_request():
        """
        Lazily initialize model components for API traffic only.

        Keep health endpoints lightweight so platform health checks do not
        block on loading FAISS/model artifacts during provisioning.
        """
        if request.path.startswith("/health"):
            return None

        if not hasattr(app, "_model_init_attempted"):
            logger.info("Initializing model loader...")
            model_loader = get_model_loader()
            app._model_init_attempted = True
            app._model_loaded = bool(model_loader.initialize())
        return None
    
    # Request timing decorator
    def timed_request(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            start_time = time.time()
            response = f(*args, **kwargs)
            elapsed_ms = (time.time() - start_time) * 1000
            logger.info(f"{request.method} {request.path} completed in {elapsed_ms:.2f}ms")
            return response
        return decorated_function
    
    # Error handlers
    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({
            "error": "Bad Request",
            "message": str(error.description)
        }), 400
    
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            "error": "Not Found",
            "message": "The requested resource was not found"
        }), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f"Internal error: {error}")
        return jsonify({
            "error": "Internal Server Error",
            "message": "An unexpected error occurred"
        }), 500
    
    # ==========================================================================
    # HEALTH CHECK ENDPOINT
    # ==========================================================================
    
    @app.route("/health", methods=["GET"])
    @timed_request
    def health_check():
        """
        Health check endpoint.
        
        Returns:
            JSON with service status and model availability
            
        Example:
            GET /health
            Response: {"status": "healthy", "model_loaded": true, "products": 785805}
        """
        model_loader = get_model_loader()
        
        return jsonify({
            "status": "healthy",
            "model_loaded": model_loader.is_available,
            "products": model_loader.num_products,
            "timestamp": time.time()
        }), 200

    @app.route("/health/live", methods=["GET"])
    @timed_request
    def health_live():
        """Liveness endpoint that never initializes model artifacts."""
        return jsonify({
            "status": "alive",
            "timestamp": time.time()
        }), 200
    
    # ==========================================================================
    # MERCHANT REGISTRATION ENDPOINT
    # ==========================================================================
    
    @app.route("/api/merchant/register", methods=["POST"])
    @timed_request
    def register_merchant():
        """
        Register a merchant's Shopify products.
        
        When a merchant installs the app, their Node.js app calls this endpoint
        to register all their products. The API then:
        1. Detects category for each product
        2. Finds Amazon representatives for embedding lookup
        3. Stores products for recommendation queries
        
        Request Body:
        {
            "merchant_id": "store.myshopify.com",
            "products": [
                {
                    "id": "gid://shopify/Product/123",
                    "title": "Organic Face Moisturizer",
                    "product_type": "Beauty",
                    "tags": ["skincare", "vegan", "organic"],
                    "price": "29.99",
                    "image": "https://cdn.shopify.com/..."
                },
                ...
            ]
        }
        
        Returns:
            JSON with registration summary
            
        Example Response:
        {
            "success": true,
            "registered": 50,
            "categories": {"beauty": 20, "fashion": 15, "electronics": 10, "home": 5},
            "merchant_id": "store.myshopify.com"
        }
        """
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({
                    "success": False,
                    "error": "No JSON data provided"
                }), 400
            
            merchant_id = data.get("merchant_id")
            products = data.get("products", [])
            
            if not merchant_id:
                return jsonify({
                    "success": False,
                    "error": "merchant_id is required"
                }), 400
            
            if not products:
                return jsonify({
                    "success": False,
                    "error": "products list is required and cannot be empty"
                }), 400
            
            # Register products
            recommender = get_recommender()
            result = recommender.register_merchant_products(merchant_id, products)
            
            return jsonify({
                "success": True,
                **result
            }), 200
            
        except Exception as e:
            logger.error(f"Error registering merchant: {e}")
            return jsonify({
                "success": False,
                "error": str(e)
            }), 500
    
    # ==========================================================================
    # RECOMMENDATIONS ENDPOINT
    # ==========================================================================
    
    @app.route("/api/recommend", methods=["POST"])
    @timed_request
    def get_recommendations():
        """
        Get personalized product recommendations.
        
        This is the main recommendation endpoint. It:
        1. Builds a weighted query vector from user behavior
           - Purchases weight: 0.7 (HIGHEST - proven preferences)
           - Current product weight: 0.3
           - Views weight: 0.1
        2. Searches FAISS for similar products
        3. Maps to merchant's Shopify products
        4. Applies all filters (location, ethical, price, category)
        
        Request Body:
        {
            "merchant_id": "store.myshopify.com",
            "current_product_id": "gid://shopify/Product/123",
            "user_history": {
                "viewed": ["gid://shopify/Product/456", "gid://shopify/Product/789"],
                "purchased": ["gid://shopify/Product/999"]
            },
            "user_location": "Pakistan",
            "user_preferences": {
                "vegan": true,
                "sustainable": false,
                "price_range": "medium"
            },
            "k": 10
        }
        
        Returns:
            JSON with personalized recommendations
            
        Example Response:
        {
            "success": true,
            "recommendations": [
                {
                    "shopify_product_id": "gid://shopify/Product/456",
                    "title": "Vitamin C Serum",
                    "category": "beauty",
                    "price": "39.99",
                    "image": "https://...",
                    "tags": ["anti-aging", "vegan"],
                    "score": 0.945,
                    "reason": "Customers who liked Organic Face Moisturizer also liked this"
                },
                ...
            ],
            "count": 10
        }
        """
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({
                    "success": False,
                    "error": "No JSON data provided"
                }), 400
            
            # Extract required parameters
            merchant_id = data.get("merchant_id")
            current_product_id = data.get("current_product_id")
            
            if not merchant_id:
                return jsonify({
                    "success": False,
                    "error": "merchant_id is required"
                }), 400
            
            # Extract optional parameters
            current_product_id = data.get("current_product_id") 
            
            # Extract optional parameters
            user_history = data.get("user_history")
            user_location = data.get("user_location")
            user_preferences = data.get("user_preferences")
            merchant_settings = data.get("merchant_settings")

            logger.info(f"API DEBUG: Received settings: {merchant_settings}") # Added debug log

            k = data.get("k", DEFAULT_K)
            exclude_current = data.get("exclude_current", True)
            exclude_viewed = data.get("exclude_viewed", False) # Default stayed false to avoid breaking
            exclude_purchased = data.get("exclude_purchased", True)
            
            # Validate k
            k = min(max(1, int(k)), MAX_K)
            
            # Get recommendations
            recommender = get_recommender()
            recommendations = recommender.get_recommendations(
                merchant_id=merchant_id,
                current_product_id=current_product_id,
                user_history=user_history,
                user_location=user_location,
                user_preferences=user_preferences,
                k=k,
                exclude_current=exclude_current,
                exclude_viewed=exclude_viewed,
                exclude_purchased=exclude_purchased,
                merchant_settings=merchant_settings
            )
            
            return jsonify({
                "success": True,
                "recommendations": recommendations,
                "count": len(recommendations)
            }), 200
            
        except Exception as e:
            logger.error(f"Error getting recommendations: {e}")
            return jsonify({
                "success": False,
                "error": str(e),
                "recommendations": [],
                "count": 0
            }), 500
    
    # ==========================================================================
    # POPULAR PRODUCTS ENDPOINT (Cold Start)
    # ==========================================================================
    
    @app.route("/api/popular", methods=["POST"])
    @timed_request
    def get_popular():
        """
        Get popular products for cold start scenarios.
        
        Used when:
        - New user with no browsing history
        - Category landing pages
        - Fallback when recommendations unavailable
        
        Request Body:
        {
            "merchant_id": "store.myshopify.com",
            "category": "beauty",  // optional
            "user_location": "Pakistan",  // optional
            "user_preferences": {
                "vegan": true
            },  // optional
            "k": 10
        }
        
        Returns:
            JSON with popular products
        """
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({
                    "success": False,
                    "error": "No JSON data provided"
                }), 400
            
            merchant_id = data.get("merchant_id")
            
            if not merchant_id:
                return jsonify({
                    "success": False,
                    "error": "merchant_id is required"
                }), 400
            
            # Extract optional parameters
            category = data.get("category")
            user_location = data.get("user_location")
            user_preferences = data.get("user_preferences")
            k = data.get("k", DEFAULT_K)
            
            # Validate k
            k = min(max(1, int(k)), MAX_K)
            
            # Get popular products
            recommender = get_recommender()
            products = recommender.get_popular_products(
                merchant_id=merchant_id,
                category=category,
                user_location=user_location,
                user_preferences=user_preferences,
                k=k
            )
            
            return jsonify({
                "success": True,
                "products": products,
                "count": len(products)
            }), 200
            
        except Exception as e:
            logger.error(f"Error getting popular products: {e}")
            return jsonify({
                "success": False,
                "error": str(e),
                "products": [],
                "count": 0
            }), 500
    
    # ==========================================================================
    # MERCHANT MANAGEMENT ENDPOINTS
    # ==========================================================================
    
    @app.route("/api/merchant/<merchant_id>", methods=["DELETE"])
    @timed_request
    def clear_merchant(merchant_id: str):
        """
        Clear all products for a merchant.
        
        Used when:
        - Merchant uninstalls the app
        - Full product refresh needed
        
        Returns:
            JSON with success status
        """
        try:
            recommender = get_recommender()
            success = recommender.clear_merchant(merchant_id)
            
            if success:
                return jsonify({
                    "success": True,
                    "message": f"Cleared all products for {merchant_id}"
                }), 200
            else:
                return jsonify({
                    "success": False,
                    "error": f"Merchant {merchant_id} not found"
                }), 404
                
        except Exception as e:
            logger.error(f"Error clearing merchant: {e}")
            return jsonify({
                "success": False,
                "error": str(e)
            }), 500
    
    @app.route("/api/merchant/<merchant_id>/products", methods=["GET"])
    @timed_request
    def get_merchant_products(merchant_id: str):
        """
        Get all registered products for a merchant.
        
        Query Parameters:
        - category: Filter by category (optional)
        
        Returns:
            JSON with list of products
        """
        try:
            category = request.args.get("category")
            
            recommender = get_recommender()
            products = recommender.get_merchant_products(merchant_id, category)
            
            return jsonify({
                "success": True,
                "products": products,
                "count": len(products)
            }), 200
            
        except Exception as e:
            logger.error(f"Error getting merchant products: {e}")
            return jsonify({
                "success": False,
                "error": str(e),
                "products": [],
                "count": 0
            }), 500
    
    return app


# Create the app instance
app = create_app()


if __name__ == "__main__":
    """Run the Flask development server."""
    logger.info("Starting Shopify AI Recommendation API...")
    logger.info(f"Server: http://{API_CONFIG['host']}:{API_CONFIG['port']}")
    
    app.run(
        host=API_CONFIG["host"],
        port=API_CONFIG["port"],
        debug=API_CONFIG["debug"]
    )
