"""
Test Suite for ML Category Classifier.

Tests:
1. Classifier training and prediction
2. Accuracy across all categories
3. Confidence scoring
4. Edge cases (empty input, ambiguous products)
5. Persistence (save / load)
6. Integration with recommender
"""

import pytest
import sys
import os
import tempfile
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.category_classifier import CategoryClassifier, get_category_classifier
from config import CATEGORY_KEYWORDS


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def classifier():
    """Create a fresh, trained classifier."""
    clf = CategoryClassifier(model_path=Path(tempfile.mktemp(suffix=".pkl")))
    clf.train()
    return clf


# =============================================================================
# TEST: TRAINING
# =============================================================================

class TestClassifierTraining:
    """Tests for classifier training."""

    def test_training_completes(self, classifier):
        """Classifier should train without errors."""
        assert classifier._is_trained

    def test_categories_populated(self, classifier):
        """All four categories should be known after training."""
        assert set(classifier._categories) == {"beauty", "fashion", "electronics", "home"}

    def test_pipeline_created(self, classifier):
        """Training should produce a sklearn Pipeline."""
        assert classifier._pipeline is not None


# =============================================================================
# TEST: PREDICTION ACCURACY
# =============================================================================

class TestPredictionAccuracy:
    """Tests for category prediction correctness."""

    # ---- Beauty ----
    @pytest.mark.parametrize("title,product_type,tags", [
        ("Organic Face Moisturizer", "Beauty", ["skincare", "vegan"]),
        ("Anti-Aging Vitamin C Serum", "Skincare", ["anti-aging"]),
        ("Hydrating Eye Cream", "Beauty", ["hydrating"]),
        ("Natural Lipstick", "Cosmetics", ["makeup", "organic"]),
        ("Hair Conditioner", "Beauty", ["hair care"]),
        ("Sunscreen SPF 50", "Skincare", []),
    ])
    def test_beauty_products(self, classifier, title, product_type, tags):
        """Beauty products should be classified correctly."""
        category, confidence = classifier.predict(title, product_type, tags)
        assert category == "beauty", f"'{title}' classified as {category}, expected beauty"
        assert confidence > 0.3

    # ---- Fashion ----
    @pytest.mark.parametrize("title,product_type,tags", [
        ("Winter Wool Coat", "Clothing", ["winter", "coat"]),
        ("Summer Cotton Dress", "Fashion", ["summer", "dress"]),
        ("Leather Handbag", "Accessories", ["bag", "leather"]),
        ("Running Sneakers", "Footwear", ["shoes", "athletic"]),
        ("Silk Scarf", "Accessories", ["scarf", "silk"]),
    ])
    def test_fashion_products(self, classifier, title, product_type, tags):
        """Fashion products should be classified correctly."""
        category, confidence = classifier.predict(title, product_type, tags)
        assert category == "fashion", f"'{title}' classified as {category}, expected fashion"
        assert confidence > 0.3

    # ---- Electronics ----
    @pytest.mark.parametrize("title,product_type,tags", [
        ("iPhone 15 Pro Case", "Electronics", ["phone", "case"]),
        ("Wireless Bluetooth Earbuds", "Audio", ["wireless", "bluetooth"]),
        ("USB-C Charging Cable", "Electronics", ["cable", "charger"]),
        ("Laptop Stand", "Electronics", ["laptop", "desk"]),
        ("Smart Home Speaker", "Electronics", ["smart home", "speaker"]),
    ])
    def test_electronics_products(self, classifier, title, product_type, tags):
        """Electronics products should be classified correctly."""
        category, confidence = classifier.predict(title, product_type, tags)
        assert category == "electronics", f"'{title}' classified as {category}, expected electronics"
        assert confidence > 0.3

    # ---- Home ----
    @pytest.mark.parametrize("title,product_type,tags", [
        ("Kitchen Utensil Set", "Home", ["kitchen", "cooking"]),
        ("Eco-Friendly Bamboo Utensil Set", "Home", ["sustainable", "bamboo"]),
        ("Scented Candle Set", "Home Decor", ["candle", "aromatherapy"]),
        ("Bed Sheet Set", "Bedding", ["bedroom", "cotton"]),
        ("Ceramic Flower Vase", "Home Decor", ["vase", "decoration"]),
    ])
    def test_home_products(self, classifier, title, product_type, tags):
        """Home products should be classified correctly."""
        category, confidence = classifier.predict(title, product_type, tags)
        assert category == "home", f"'{title}' classified as {category}, expected home"
        assert confidence > 0.3


# =============================================================================
# TEST: CONFIDENCE SCORING
# =============================================================================

class TestConfidenceScoring:
    """Tests for confidence score behavior."""

    def test_confidence_range(self, classifier):
        """Confidence should be between 0.0 and 1.0."""
        _, confidence = classifier.predict("Face Cream", "Beauty", ["skincare"])
        assert 0.0 <= confidence <= 1.0

    def test_high_confidence_clear_category(self, classifier):
        """Clear category products should have high confidence."""
        _, conf = classifier.predict(
            "Moisturizer Face Cream Skincare",
            "Beauty",
            ["skincare", "moisturizer", "cream"]
        )
        assert conf > 0.5, f"Expected high confidence, got {conf}"

    def test_returns_valid_category(self, classifier):
        """Prediction should always return a valid category."""
        category, _ = classifier.predict("Some random product", "", [])
        assert category in {"beauty", "fashion", "electronics", "home"}


# =============================================================================
# TEST: EDGE CASES
# =============================================================================

class TestEdgeCases:
    """Tests for edge case handling."""

    def test_empty_title(self, classifier):
        """Empty title should still return a category."""
        category, confidence = classifier.predict("", "", [])
        assert category in {"beauty", "fashion", "electronics", "home"}
        assert confidence == 0.0  # no signal

    def test_tags_as_string(self, classifier):
        """Tags passed as comma-separated string should work."""
        category, confidence = classifier.predict(
            "Face Cream",
            "Beauty",
            "skincare, moisturizer, vegan"  # string instead of list
        )
        assert category == "beauty"

    def test_none_fields(self, classifier):
        """None values should not crash."""
        category, _ = classifier.predict(None, None, None)
        assert category in {"beauty", "fashion", "electronics", "home"}

    def test_very_long_title(self, classifier):
        """Extremely long titles should not crash."""
        long_title = "Ultra Premium " * 100 + "Face Cream"
        category, _ = classifier.predict(long_title, "Beauty", [])
        assert category in {"beauty", "fashion", "electronics", "home"}


# =============================================================================
# TEST: PERSISTENCE
# =============================================================================

class TestPersistence:
    """Tests for model save/load."""

    def test_save_and_load(self, classifier):
        """Classifier should produce same results after save/load."""
        # Predict before save
        cat1, conf1 = classifier.predict("Face Moisturizer", "Beauty", ["skincare"])

        # Save
        classifier.save()
        assert classifier.model_path.exists()

        # Load into new instance
        clf2 = CategoryClassifier(model_path=classifier.model_path)
        loaded = clf2.load()
        assert loaded is True

        # Predict after load
        cat2, conf2 = clf2.predict("Face Moisturizer", "Beauty", ["skincare"])
        assert cat1 == cat2
        assert abs(conf1 - conf2) < 0.001

    def test_load_nonexistent(self):
        """Loading nonexistent model should return False."""
        clf = CategoryClassifier(model_path=Path("/tmp/nonexistent_model.pkl"))
        assert clf.load() is False

    def test_model_file_size(self, classifier):
        """Saved model should be small (< 500 KB)."""
        classifier.save()
        size_kb = classifier.model_path.stat().st_size / 1024
        assert size_kb < 500, f"Model too large: {size_kb:.0f} KB"

    def test_cleanup(self, classifier):
        """Clean up temp model file."""
        classifier.save()
        if classifier.model_path.exists():
            classifier.model_path.unlink()


# =============================================================================
# TEST: SINGLETON
# =============================================================================

class TestSingleton:
    """Tests for the singleton accessor."""

    def test_get_category_classifier(self):
        """Singleton should return a trained classifier."""
        clf = get_category_classifier()
        assert clf._is_trained
        assert clf._pipeline is not None

    def test_singleton_same_instance(self):
        """Multiple calls should return the same instance."""
        clf1 = get_category_classifier()
        clf2 = get_category_classifier()
        assert clf1 is clf2


# =============================================================================
# TEST: INTEGRATION WITH RECOMMENDER
# =============================================================================

class TestRecommenderIntegration:
    """Tests that the ML classifier integrates correctly with the recommender."""

    @pytest.fixture
    def recommender(self):
        from src.recommender import ProductRecommender
        return ProductRecommender()

    def test_detect_category_returns_tuple(self, recommender):
        """_detect_category should now return (category, confidence, method)."""
        product = {
            "title": "Organic Face Cream",
            "product_type": "Beauty",
            "tags": ["skincare"]
        }
        result = recommender._detect_category(product)
        assert isinstance(result, tuple)
        assert len(result) == 3

        category, confidence, method = result
        assert category in {"beauty", "fashion", "electronics", "home"}
        assert 0.0 <= confidence <= 1.0
        assert method in {"ml", "keywords", "ml+keywords"}

    def test_registration_stores_confidence(self, recommender):
        """Registered products should have category_confidence and category_method."""
        products = [
            {
                "id": "test_001",
                "title": "Vitamin C Serum",
                "product_type": "Beauty",
                "tags": ["skincare", "anti-aging"]
            }
        ]
        recommender.register_merchant_products("test-store", products)
        stored = recommender.get_merchant_products("test-store")

        assert len(stored) == 1
        product = stored[0]
        assert "category_confidence" in product
        assert "category_method" in product
        assert product["category"] == "beauty"


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
