import numpy as np

from src.filters import apply_all_filters, apply_location_filter
from src.recommender import ProductRecommender


def _make_recommender_with_products():
    recommender = ProductRecommender()
    merchant_id = "settings-test.myshopify.com"
    products = {
        "p1": {
            "id": "p1",
            "title": "Beauty Current",
            "category": "beauty",
            "tags": ["skincare"],
            "price": "30.00",
            "image": "",
            "amazon_representatives": ["rep-beauty-1"],
        },
        "p2": {
            "id": "p2",
            "title": "Beauty Purchased",
            "category": "beauty",
            "tags": ["skincare"],
            "price": "35.00",
            "image": "",
            "amazon_representatives": ["rep-beauty-2"],
        },
        "p3": {
            "id": "p3",
            "title": "Electronics Candidate",
            "category": "electronics",
            "tags": ["phone"],
            "price": "50.00",
            "image": "",
            "amazon_representatives": ["rep-electronics-1"],
        },
    }
    recommender._merchant_products[merchant_id] = products
    recommender._category_index[merchant_id] = {
        "beauty": ["p1", "p2"],
        "electronics": ["p3"],
    }
    return recommender, merchant_id


def test_location_filter_accepts_iso_country_code():
    products = [
        {"id": "summer", "title": "Beach Swimsuit", "tags": ["swimwear", "summer"]},
        {"id": "winter", "title": "Warm Winter Jacket", "tags": ["winter", "jacket"]},
    ]

    filtered = apply_location_filter(products, "AR")
    filtered_ids = [p["id"] for p in filtered]

    assert "summer" not in filtered_ids
    assert "winter" in filtered_ids


def test_same_category_filter_can_be_disabled_via_settings():
    products = [
        {"id": "beauty-1", "category": "beauty", "tags": []},
        {"id": "electronics-1", "category": "electronics", "tags": []},
    ]
    merchant_settings = {"filters": {"sameCategoryOnly": False}}

    filtered = apply_all_filters(
        products=products,
        target_category="beauty",
        merchant_settings=merchant_settings,
    )
    filtered_ids = [p["id"] for p in filtered]

    assert "beauty-1" in filtered_ids
    assert "electronics-1" in filtered_ids


def test_exclude_purchased_toggle_is_respected():
    recommender, merchant_id = _make_recommender_with_products()

    class _FakeModelLoader:
        is_available = True

        @staticmethod
        def get_embedding(_rep):
            return np.array([1.0, 0.0], dtype=float)

    recommender._build_weighted_query_vector = lambda **_kwargs: (
        np.array([1.0, 0.0], dtype=float),
        "beauty",
    )
    recommender._get_model_loader = lambda: _FakeModelLoader()

    user_history = {"viewed": [], "added_to_cart": [], "purchased": ["p2"]}
    merchant_settings = {"filters": {"sameCategoryOnly": False}}

    excluded = recommender.get_recommendations(
        merchant_id=merchant_id,
        current_product_id="p1",
        user_history=user_history,
        k=3,
        exclude_current=True,
        exclude_purchased=True,
        merchant_settings=merchant_settings,
    )
    included = recommender.get_recommendations(
        merchant_id=merchant_id,
        current_product_id="p1",
        user_history=user_history,
        k=3,
        exclude_current=True,
        exclude_purchased=False,
        merchant_settings=merchant_settings,
    )

    excluded_ids = [r["shopify_product_id"] for r in excluded]
    included_ids = [r["shopify_product_id"] for r in included]

    assert "p2" not in excluded_ids
    assert "p2" in included_ids


def test_fallback_popular_obeys_same_category_setting():
    recommender, merchant_id = _make_recommender_with_products()
    recommender._build_weighted_query_vector = lambda **_kwargs: (None, "beauty")

    same_category_settings = {"filters": {"sameCategoryOnly": True}}
    cross_category_settings = {"filters": {"sameCategoryOnly": False}}

    same_category_recs = recommender.get_recommendations(
        merchant_id=merchant_id,
        current_product_id="p1",
        user_history=None,
        k=3,
        merchant_settings=same_category_settings,
    )
    cross_category_recs = recommender.get_recommendations(
        merchant_id=merchant_id,
        current_product_id="p1",
        user_history=None,
        k=3,
        merchant_settings=cross_category_settings,
    )

    assert all(rec["category"] == "beauty" for rec in same_category_recs)
    assert any(rec["category"] == "electronics" for rec in cross_category_recs)
