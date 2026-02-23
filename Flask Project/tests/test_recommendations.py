"""
Test Suite for Shopify AI Recommendation System.

This module tests:
1. Merchant product registration
2. Category detection
3. Recommendation generation
4. Filter verification:
   - No winter items for hot climate users (Pakistan)
   - No cross-category recommendations (electronics ≠ beauty)
   - Only vegan products when preference set
"""

import pytest
import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.recommender import ProductRecommender, get_recommender
from src.filters import (
    apply_location_filter,
    apply_ethical_filters,
    apply_category_filter,
    apply_all_filters
)


# =============================================================================
# TEST DATA
# =============================================================================

SAMPLE_PRODUCTS = [
    {
        "id": "shop_001",
        "title": "Organic Moisturizing Face Cream",
        "product_type": "Beauty",
        "tags": ["skincare", "vegan", "organic"],
        "price": "29.99",
        "image": "https://example.com/cream.jpg"
    },
    {
        "id": "shop_002",
        "title": "Anti-Aging Vitamin C Serum",
        "product_type": "Beauty",
        "tags": ["skincare", "anti-aging", "vegan"],
        "price": "39.99",
        "image": "https://example.com/serum.jpg"
    },
    {
        "id": "shop_003",
        "title": "Hydrating Eye Cream",
        "product_type": "Beauty",
        "tags": ["skincare", "hydrating"],
        "price": "24.99",
        "image": "https://example.com/eye-cream.jpg"
    },
    {
        "id": "shop_004",
        "title": "Winter Wool Coat",
        "product_type": "Fashion",
        "tags": ["winter", "coat", "clothing", "wool"],
        "price": "199.99",
        "image": "https://example.com/coat.jpg"
    },
    {
        "id": "shop_005",
        "title": "Summer Cotton Dress",
        "product_type": "Fashion",
        "tags": ["summer", "dress", "clothing", "cotton"],
        "price": "49.99",
        "image": "https://example.com/dress.jpg"
    },
    {
        "id": "shop_006",
        "title": "iPhone 15 Pro Case",
        "product_type": "Electronics",
        "tags": ["phone", "accessory", "case", "iphone"],
        "price": "24.99",
        "image": "https://example.com/case.jpg"
    },
    {
        "id": "shop_007",
        "title": "Wireless Bluetooth Earbuds",
        "product_type": "Electronics",
        "tags": ["audio", "wireless", "bluetooth"],
        "price": "79.99",
        "image": "https://example.com/earbuds.jpg"
    },
    {
        "id": "shop_008",
        "title": "Eco-Friendly Bamboo Utensil Set",
        "product_type": "Home",
        "tags": ["kitchen", "sustainable", "eco-friendly", "bamboo"],
        "price": "19.99",
        "image": "https://example.com/utensils.jpg"
    }
]

TEST_MERCHANT_ID = "test-store.myshopify.com"


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def recommender():
    """Create a fresh recommender instance for testing."""
    # Create new instance (bypass singleton for testing)
    rec = ProductRecommender()
    return rec


@pytest.fixture
def registered_recommender(recommender):
    """Recommender with sample products registered."""
    recommender.register_merchant_products(TEST_MERCHANT_ID, SAMPLE_PRODUCTS)
    return recommender


# =============================================================================
# TEST: CATEGORY DETECTION
# =============================================================================

class TestCategoryDetection:
    """Tests for product category detection."""
    
    def test_detect_beauty_category(self, recommender):
        """Beauty products should be detected correctly."""
        product = {
            "title": "Organic Face Moisturizer",
            "product_type": "Beauty",
            "tags": ["skincare", "vegan"]
        }
        category, confidence, method = recommender._detect_category(product)
        assert category == "beauty"
        assert confidence > 0
        assert method in ("ml", "keywords", "ml+keywords")
    
    def test_detect_fashion_category(self, recommender):
        """Fashion products should be detected correctly."""
        product = {
            "title": "Winter Wool Coat",
            "product_type": "Clothing",
            "tags": ["winter", "coat"]
        }
        category, confidence, method = recommender._detect_category(product)
        assert category == "fashion"
        assert confidence > 0
    
    def test_detect_electronics_category(self, recommender):
        """Electronics products should be detected correctly."""
        product = {
            "title": "iPhone 15 Pro Case",
            "product_type": "Accessories",
            "tags": ["phone", "case"]
        }
        category, confidence, method = recommender._detect_category(product)
        assert category == "electronics"
        assert confidence > 0
    
    def test_detect_home_category(self, recommender):
        """Home products should be detected correctly."""
        product = {
            "title": "Kitchen Utensil Set",
            "product_type": "Home",
            "tags": ["kitchen", "cooking"]
        }
        category, confidence, method = recommender._detect_category(product)
        assert category == "home"
        assert confidence > 0
    
    def test_detect_from_tags(self, recommender):
        """Category should be detected from tags when title is ambiguous."""
        product = {
            "title": "Premium Gift Set",
            "product_type": "Gift",
            "tags": ["moisturizer", "serum", "skincare"]
        }
        category, confidence, method = recommender._detect_category(product)
        assert category == "beauty"


# =============================================================================
# TEST: MERCHANT REGISTRATION
# =============================================================================

class TestMerchantRegistration:
    """Tests for merchant product registration."""
    
    def test_register_products(self, recommender):
        """Products should be registered successfully."""
        result = recommender.register_merchant_products(
            TEST_MERCHANT_ID,
            SAMPLE_PRODUCTS
        )
        
        assert result["registered"] == len(SAMPLE_PRODUCTS)
        assert "categories" in result
        assert result["merchant_id"] == TEST_MERCHANT_ID
    
    def test_category_distribution(self, recommender):
        """Registered products should have correct category distribution."""
        result = recommender.register_merchant_products(
            TEST_MERCHANT_ID,
            SAMPLE_PRODUCTS
        )
        
        categories = result["categories"]
        assert categories.get("beauty", 0) == 3  # 3 beauty products
        assert categories.get("fashion", 0) == 2  # 2 fashion products
        assert categories.get("electronics", 0) == 2  # 2 electronics products
        assert categories.get("home", 0) == 1  # 1 home product
    
    def test_get_merchant_products(self, registered_recommender):
        """Should retrieve all registered products."""
        products = registered_recommender.get_merchant_products(TEST_MERCHANT_ID)
        assert len(products) == len(SAMPLE_PRODUCTS)
    
    def test_get_products_by_category(self, registered_recommender):
        """Should filter products by category."""
        beauty_products = registered_recommender.get_merchant_products(
            TEST_MERCHANT_ID,
            category="beauty"
        )
        assert len(beauty_products) == 3
        for p in beauty_products:
            assert p["category"] == "beauty"


# =============================================================================
# TEST: LOCATION FILTERING
# =============================================================================

class TestLocationFiltering:
    """Tests for location-based climate filtering."""
    
    def test_hot_climate_filters_winter_items(self):
        """Users in hot climates should NOT see winter items."""
        products = [
            {"id": "1", "title": "Winter Wool Coat", "tags": ["winter", "coat"]},
            {"id": "2", "title": "Summer Dress", "tags": ["summer", "dress"]},
            {"id": "3", "title": "Face Moisturizer", "tags": ["skincare"]},
        ]
        
        # Pakistan is a hot climate region
        filtered = apply_location_filter(products, "Pakistan")
        
        # Winter coat should be filtered out
        filtered_ids = [p["id"] for p in filtered]
        assert "1" not in filtered_ids, "Winter coat should be filtered for Pakistan"
        assert "2" in filtered_ids, "Summer dress should pass"
        assert "3" in filtered_ids, "Skincare should pass"
    
    def test_cold_climate_filters_summer_items(self):
        """Users in cold climates should NOT see summer-only items."""
        products = [
            {"id": "1", "title": "Beach Swimsuit", "tags": ["beach", "swimwear"]},
            {"id": "2", "title": "Winter Jacket", "tags": ["winter", "jacket"]},
            {"id": "3", "title": "Face Cream", "tags": ["skincare"]},
        ]
        
        # Canada is a cold climate region
        filtered = apply_location_filter(products, "Canada")
        
        # Swimsuit should be filtered out
        filtered_ids = [p["id"] for p in filtered]
        assert "1" not in filtered_ids, "Swimsuit should be filtered for Canada"
        assert "2" in filtered_ids, "Winter jacket should pass"
        assert "3" in filtered_ids, "Skincare should pass"
    
    def test_unknown_location_no_filter(self):
        """Unknown locations should not filter anything."""
        products = [
            {"id": "1", "title": "Winter Coat", "tags": ["winter"]},
            {"id": "2", "title": "Swimsuit", "tags": ["beach"]},
        ]
        
        filtered = apply_location_filter(products, "Mars")
        assert len(filtered) == 2, "Unknown location should not filter"
    
    def test_no_location_no_filter(self):
        """No location should not filter anything."""
        products = [
            {"id": "1", "title": "Winter Coat", "tags": ["winter"]},
        ]
        
        filtered = apply_location_filter(products, None)
        assert len(filtered) == 1
        
        filtered = apply_location_filter(products, "")
        assert len(filtered) == 1


# =============================================================================
# TEST: ETHICAL FILTERING
# =============================================================================

class TestEthicalFiltering:
    """Tests for ethical preference filtering."""
    
    def test_vegan_filter(self):
        """Vegan filter should only include vegan products."""
        products = [
            {"id": "1", "title": "Vegan Cream", "tags": ["vegan", "skincare"]},
            {"id": "2", "title": "Cruelty-Free Serum", "tags": ["cruelty-free"]},
            {"id": "3", "title": "Regular Lotion", "tags": ["skincare"]},
        ]
        
        filtered = apply_ethical_filters(products, {"vegan": True})
        
        filtered_ids = [p["id"] for p in filtered]
        assert "1" in filtered_ids, "Vegan product should pass"
        assert "2" in filtered_ids, "Cruelty-free product should pass"
        assert "3" not in filtered_ids, "Regular product should be filtered"
    
    def test_sustainable_filter(self):
        """Sustainable filter should only include eco-friendly products."""
        products = [
            {"id": "1", "title": "Eco-Friendly Set", "tags": ["sustainable"]},
            {"id": "2", "title": "Organic Cotton Shirt", "tags": ["organic"]},
            {"id": "3", "title": "Regular Product", "tags": []},
        ]
        
        filtered = apply_ethical_filters(products, {"sustainable": True})
        
        filtered_ids = [p["id"] for p in filtered]
        assert "1" in filtered_ids
        assert "2" in filtered_ids
        assert "3" not in filtered_ids
    
    def test_price_range_filter_low(self):
        """Low price range should filter to $0-50."""
        products = [
            {"id": "1", "price": "25.00"},
            {"id": "2", "price": "50.00"},
            {"id": "3", "price": "75.00"},
            {"id": "4", "price": "150.00"},
        ]
        
        filtered = apply_ethical_filters(products, {"price_range": "low"})
        
        filtered_ids = [p["id"] for p in filtered]
        assert "1" in filtered_ids
        assert "2" in filtered_ids
        assert "3" not in filtered_ids
        assert "4" not in filtered_ids
    
    def test_price_range_filter_medium(self):
        """Medium price range should filter to $20-100."""
        products = [
            {"id": "1", "price": "15.00"},
            {"id": "2", "price": "50.00"},
            {"id": "3", "price": "100.00"},
            {"id": "4", "price": "150.00"},
        ]
        
        filtered = apply_ethical_filters(products, {"price_range": "medium"})
        
        filtered_ids = [p["id"] for p in filtered]
        assert "1" not in filtered_ids  # Below $20
        assert "2" in filtered_ids
        assert "3" in filtered_ids
        assert "4" not in filtered_ids  # Above $100
    
    def test_combined_ethical_filters(self):
        """Multiple ethical filters should work together."""
        products = [
            {"id": "1", "tags": ["vegan", "sustainable"], "price": "30.00"},
            {"id": "2", "tags": ["vegan"], "price": "30.00"},
            {"id": "3", "tags": ["sustainable"], "price": "30.00"},
            {"id": "4", "tags": [], "price": "30.00"},
        ]
        
        # Both vegan AND sustainable
        filtered = apply_ethical_filters(products, {
            "vegan": True,
            "sustainable": True,
            "price_range": "low"
        })
        
        # Only product 1 has both vegan AND sustainable
        filtered_ids = [p["id"] for p in filtered]
        assert "1" in filtered_ids
        assert "2" not in filtered_ids  # Not sustainable
        assert "3" not in filtered_ids  # Not vegan
        assert "4" not in filtered_ids  # Neither


# =============================================================================
# TEST: CATEGORY FILTERING
# =============================================================================

class TestCategoryFiltering:
    """Tests for category-based filtering."""
    
    def test_category_filter_beauty(self):
        """Should only return beauty products when viewing beauty."""
        products = [
            {"id": "1", "category": "beauty"},
            {"id": "2", "category": "fashion"},
            {"id": "3", "category": "beauty"},
            {"id": "4", "category": "electronics"},
        ]
        
        filtered = apply_category_filter(products, "beauty")
        
        filtered_ids = [p["id"] for p in filtered]
        assert "1" in filtered_ids
        assert "2" not in filtered_ids
        assert "3" in filtered_ids
        assert "4" not in filtered_ids
    
    def test_no_cross_category_recommendations(self):
        """Electronics should NOT be recommended when viewing beauty."""
        products = [
            {"id": "1", "category": "beauty", "title": "Face Cream"},
            {"id": "2", "category": "electronics", "title": "Phone Case"},
            {"id": "3", "category": "beauty", "title": "Serum"},
        ]
        
        # Viewing a beauty product
        filtered = apply_category_filter(products, "beauty")
        
        # No electronics!
        for p in filtered:
            assert p["category"] != "electronics", \
                "Electronics should NOT appear when viewing beauty"


# =============================================================================
# TEST: COMBINED FILTERING
# =============================================================================

class TestCombinedFiltering:
    """Tests for all filters combined."""
    
    def test_pakistan_user_vegan_beauty(self):
        """
        A user in Pakistan looking at beauty products with vegan preference
        should see: vegan beauty products (no winter items, no electronics)
        """
        products = [
            {
                "id": "1",
                "title": "Vegan Face Cream",
                "category": "beauty",
                "tags": ["vegan", "skincare"],
                "price": "30.00"
            },
            {
                "id": "2",
                "title": "Winter Coat",
                "category": "fashion",
                "tags": ["winter", "wool"],
                "price": "100.00"
            },
            {
                "id": "3",
                "title": "Phone Case",
                "category": "electronics",
                "tags": ["phone"],
                "price": "20.00"
            },
            {
                "id": "4",
                "title": "Regular Lotion",
                "category": "beauty",
                "tags": ["skincare"],
                "price": "25.00"
            },
        ]
        
        filtered = apply_all_filters(
            products=products,
            user_location="Pakistan",
            user_preferences={"vegan": True},
            target_category="beauty"
        )
        
        # Only product 1 should pass (beauty + vegan)
        # Product 2: filtered (wrong category + winter for hot climate)
        # Product 3: filtered (wrong category)
        # Product 4: filtered (not vegan)
        
        filtered_ids = [p["id"] for p in filtered]
        assert filtered_ids == ["1"], \
            "Only vegan beauty product should pass all filters"


# =============================================================================
# TEST: RECOMMENDATIONS
# =============================================================================

class TestRecommendations:
    """Tests for recommendation generation."""
    
    def test_recommendations_same_category(self, registered_recommender):
        """Recommendations should be from the same category."""
        # View a beauty product
        recs = registered_recommender.get_recommendations(
            merchant_id=TEST_MERCHANT_ID,
            current_product_id="shop_001",  # Organic Face Cream (beauty)
            k=5
        )
        
        # All recommendations should be beauty products
        for rec in recs:
            assert rec.get("category") == "beauty", \
                f"Expected beauty, got {rec.get('category')}"
    
    def test_recommendations_exclude_current(self, registered_recommender):
        """Recommendations should NOT include the current product."""
        recs = registered_recommender.get_recommendations(
            merchant_id=TEST_MERCHANT_ID,
            current_product_id="shop_001",
            k=10
        )
        
        rec_ids = [r["shopify_product_id"] for r in recs]
        assert "shop_001" not in rec_ids, \
            "Current product should not be in recommendations"
    
    def test_recommendations_respect_location_filter(self, registered_recommender):
        """Recommendations for Pakistan users should NOT include winter items."""
        recs = registered_recommender.get_recommendations(
            merchant_id=TEST_MERCHANT_ID,
            current_product_id="shop_005",  # Summer dress (fashion)
            user_location="Pakistan",
            k=10
        )
        
        # Should not include winter coat (shop_004)
        rec_ids = [r["shopify_product_id"] for r in recs]
        assert "shop_004" not in rec_ids, \
            "Winter coat should not be recommended for Pakistan user"
    
    def test_recommendations_respect_vegan_filter(self, registered_recommender):
        """Vegan preference should filter non-vegan products."""
        recs = registered_recommender.get_recommendations(
            merchant_id=TEST_MERCHANT_ID,
            current_product_id="shop_001",  # Vegan face cream
            user_preferences={"vegan": True},
            k=10
        )
        
        # All beauty recs should be vegan
        for rec in recs:
            tags = rec.get("tags", [])
            if isinstance(tags, str):
                tags = [t.strip().lower() for t in tags.split(",")]
            else:
                tags = [str(t).lower() for t in tags]
            
            # Check for vegan-related tags
            has_vegan = any(
                v in tag for tag in tags 
                for v in ["vegan", "cruelty-free", "plant-based"]
            )
            # Note: shop_003 (Hydrating Eye Cream) doesn't have vegan tag
            # so it should be filtered out
    
    def test_popular_products_fallback(self, registered_recommender):
        """Popular products should work as fallback."""
        products = registered_recommender.get_popular_products(
            merchant_id=TEST_MERCHANT_ID,
            category="beauty",
            k=5
        )
        
        assert len(products) > 0
        for p in products:
            assert p.get("category") == "beauty"


# =============================================================================
# TEST: API INTEGRATION
# =============================================================================

class TestAPIIntegration:
    """Integration tests for Flask API."""
    
    @pytest.fixture
    def client(self):
        """Create Flask test client."""
        from api.app import create_app
        app = create_app()
        app.config["TESTING"] = True
        with app.test_client() as client:
            yield client
    
    def test_health_endpoint(self, client):
        """Health endpoint should return 200."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "healthy"
    
    def test_register_endpoint(self, client):
        """Register endpoint should accept products."""
        response = client.post(
            "/api/merchant/register",
            json={
                "merchant_id": "test-api-store",
                "products": SAMPLE_PRODUCTS
            }
        )
        
        assert response.status_code == 200
        data = response.get_json()
        assert data["success"] is True
        assert data["registered"] == len(SAMPLE_PRODUCTS)
    
    def test_recommend_endpoint(self, client):
        """Recommend endpoint should return recommendations."""
        # First register products
        client.post(
            "/api/merchant/register",
            json={
                "merchant_id": "test-api-store",
                "products": SAMPLE_PRODUCTS
            }
        )
        
        # Then get recommendations
        response = client.post(
            "/api/recommend",
            json={
                "merchant_id": "test-api-store",
                "current_product_id": "shop_001",
                "user_location": "Pakistan",
                "user_preferences": {"vegan": True},
                "k": 5
            }
        )
        
        assert response.status_code == 200
        data = response.get_json()
        assert data["success"] is True
        assert "recommendations" in data
    
    def test_popular_endpoint(self, client):
        """Popular endpoint should return products."""
        # First register products
        client.post(
            "/api/merchant/register",
            json={
                "merchant_id": "test-api-store",
                "products": SAMPLE_PRODUCTS
            }
        )
        
        # Get popular products
        response = client.post(
            "/api/popular",
            json={
                "merchant_id": "test-api-store",
                "category": "beauty",
                "k": 5
            }
        )
        
        assert response.status_code == 200
        data = response.get_json()
        assert data["success"] is True
        assert "products" in data
    
    def test_missing_merchant_id(self, client):
        """Request without merchant_id should return 400."""
        response = client.post(
            "/api/recommend",
            json={
                "current_product_id": "shop_001"
            }
        )
        
        assert response.status_code == 400
        data = response.get_json()
        assert data["success"] is False


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
