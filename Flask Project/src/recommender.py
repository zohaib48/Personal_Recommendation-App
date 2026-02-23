"""
Product Recommender for Shopify AI Recommendation System.

This module is the CORE of the recommendation engine:

1. Merchant Product Registration
   - Stores Shopify products in memory
   - Detects category from product title/type/tags
   - Finds Amazon product "representatives" for each category

2. Recommendation Generation
   - Builds weighted query vectors (purchases 7x > views)
   - Searches FAISS for similar products
   - Maps results back to merchant's Shopify products
   - Applies all filters (location, ethical, price)

The key insight: Shopify merchants have different product IDs than Amazon,
so we use category-based mapping to bridge the gap.
"""

import logging
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
from collections import defaultdict

from config import (
    CATEGORY_KEYWORDS,
    SIGNAL_WEIGHTS,
    AMAZON_REPS_PER_PRODUCT,
    MAX_PURCHASED_HISTORY,
    MAX_VIEWED_HISTORY,
    MIN_SIMILARITY_SCORE,
    DEFAULT_K,
    MAX_K,
    MODEL_CONFIG,
    TAG_BOOST_WEIGHT,
    PRICE_PROXIMITY_WEIGHT,
    PRICE_PROXIMITY_RANGE,
)
from src.model_loader import get_model_loader
from src.filters import apply_all_filters, exclude_products
from src.category_classifier import get_category_classifier

logger = logging.getLogger(__name__)


class ProductRecommender:
    """
    Core recommendation engine for Shopify AI recommendations.
    
    This class handles:
    1. Merchant product registration and category detection
    2. Building weighted query vectors from user behavior
    3. FAISS similarity search
    4. Mapping results to merchant's Shopify products
    5. Applying all filters
    
    Usage:
        recommender = ProductRecommender.get_instance()
        
        # Register merchant products
        recommender.register_merchant_products("store.myshopify.com", products)
        
        # Get recommendations
        recs = recommender.get_recommendations(
            merchant_id="store.myshopify.com",
            current_product_id="shop_001",
            user_history={"viewed": [...], "purchased": [...]},
            user_location="Pakistan",
            user_preferences={"vegan": True}
        )
    """
    
    _instance: Optional['ProductRecommender'] = None
    
    def __init__(self):
        """Initialize the recommender (use get_instance() instead)."""
        # Merchant product storage
        # Structure: {merchant_id: {product_id: product_data_with_mapping}}
        self._merchant_products: Dict[str, Dict[str, Dict]] = {}
        
        # Category to products index for fast lookup
        # Structure: {merchant_id: {category: [product_ids]}}
        self._category_index: Dict[str, Dict[str, List[str]]] = {}
        
        # Model loader reference
        self._model_loader = None
        
        # Category representatives cache
        # Structure: {category: [amazon_product_ids]}  
        self._category_representatives: Dict[str, List[str]] = {}
        
        logger.info("ProductRecommender initialized")
    
    @classmethod
    def get_instance(cls) -> 'ProductRecommender':
        """Get the singleton instance of ProductRecommender."""
        if cls._instance is None:
            cls._instance = ProductRecommender()
        return cls._instance
    
    def _get_model_loader(self):
        """Get the model loader instance, initializing if needed."""
        if self._model_loader is None:
            self._model_loader = get_model_loader()
            self._model_loader.initialize()
        return self._model_loader
    
    def _detect_category(self, product: Dict[str, Any]) -> Tuple[str, float, str]:
        """
        Detect product category using ML classifier with keyword fallback.

        Strategy:
        1. Try ML classifier (TF-IDF + LinearSVC)
        2. If confidence >= 0.6, use ML result
        3. Otherwise fall back to keyword matching

        Args:
            product: Product dictionary with title, product_type, tags

        Returns:
            Tuple of (category, confidence, method)
            - category: one of beauty, fashion, electronics, home
            - confidence: 0.0-1.0 score
            - method: "ml" or "keywords"
        """
        title = str(product.get("title", ""))
        product_type = str(product.get("product_type", ""))
        tags = product.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",")]

        # 1. Try ML classifier
        try:
            classifier = get_category_classifier()
            ml_category, ml_confidence = classifier.predict(title, product_type, tags)

            if ml_confidence >= 0.6:
                logger.debug(
                    "ML classified '%s' → %s (%.2f)",
                    title, ml_category, ml_confidence,
                )
                return ml_category, ml_confidence, "ml"

            # Medium confidence — cross-check with keywords
            kw_category = self._detect_category_keywords(product)
            if kw_category == ml_category:
                return ml_category, ml_confidence, "ml+keywords"

            # Disagree — trust keywords for now
            logger.debug(
                "ML (%.2f %s) vs keywords (%s) — using keywords for '%s'",
                ml_confidence, ml_category, kw_category, title,
            )
            return kw_category, 0.5, "keywords"

        except Exception as e:
            logger.warning("ML category detection failed: %s", e)

        # 2. Fallback to keyword matching
        kw_category = self._detect_category_keywords(product)
        return kw_category, 0.5, "keywords"

    def _detect_category_keywords(self, product: Dict[str, Any]) -> str:
        """
        Legacy keyword-based category detection (fallback).

        Uses CATEGORY_KEYWORDS from config to score each category
        by counting matching keywords in title + product_type + tags.
        """
        title = str(product.get("title", "")).lower()
        product_type = str(product.get("product_type", "")).lower()

        tags = product.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",")]
        tags_text = " ".join(str(t).lower() for t in tags)

        combined_text = f"{title} {product_type} {tags_text}"

        # Score each category
        category_scores: Dict[str, int] = {}

        for category, keywords in CATEGORY_KEYWORDS.items():
            score = 0
            for keyword in keywords:
                if keyword.lower() in combined_text:
                    score += len(keyword.split())
            category_scores[category] = score

        # Return category with highest score
        if not category_scores or max(category_scores.values()) == 0:
            for category in CATEGORY_KEYWORDS.keys():
                if category in product_type:
                    return category
            return "home"  # Fallback default

        best_category = max(category_scores.items(), key=lambda x: x[1])
        return best_category[0]
    
    def _find_amazon_representatives(
        self,
        product: Dict[str, Any],
        category: str,
        limit: int = AMAZON_REPS_PER_PRODUCT
    ) -> List[str]:
        """
        Find Amazon products that can represent a Shopify product.
        
        Since Shopify products don't exist in our Amazon-trained model,
        we find similar Amazon products in the same category to use
        as "representatives" for embedding lookup.
        
        Strategy:
        1. Get most popular Amazon products in the same category
        2. Return top N as representatives
        
        Args:
            product: Shopify product dictionary
            category: Detected category
            limit: Number of representatives to return
            
        Returns:
            List of Amazon product IDs
        """
        # Check cache first
        if category in self._category_representatives:
            return self._category_representatives[category][:limit]
        
        # Get popular Amazon products in this category
        model_loader = self._get_model_loader()
        
        if not model_loader.is_available:
            logger.warning("Model not available, returning empty representatives")
            return []
        
        # Get products by category from metadata
        amazon_products = model_loader.get_products_by_category(
            category=category,
            limit=100,  # Get more than needed for caching
            sort_by_popularity=True
        )
        
        # Cache the results
        self._category_representatives[category] = amazon_products
        
        return amazon_products[:limit]
    
    def register_merchant_products(
        self,
        merchant_id: str,
        products: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Register a merchant's Shopify products.
        
        This method:
        1. Stores all products in memory
        2. Detects category for each product
        3. Finds Amazon representatives for each product
        4. Builds category index for fast lookup
        
        Args:
            merchant_id: Shopify store identifier (e.g., "store.myshopify.com")
            products: List of product dictionaries with:
                - id: Shopify product ID
                - title: Product title
                - product_type: Shopify product type
                - tags: List of tags or comma-separated string
                - price: Product price
                - image: Product image URL (optional)
                
        Returns:
            Registration summary with counts and categories
            
        Example:
            >>> recommender.register_merchant_products("test-store", [
            ...     {"id": "shop_001", "title": "Face Cream", "tags": ["skincare"]},
            ...     {"id": "shop_002", "title": "Winter Coat", "tags": ["clothing"]}
            ... ])
            {"registered": 2, "categories": {"beauty": 1, "fashion": 1}}
        """
        logger.info(f"Registering {len(products)} products for merchant {merchant_id}")
        
        # Replace merchant snapshot atomically on each registration call.
        # This prevents stale products/categories when Node re-registers
        # after create/update/delete webhook syncs.
        self._merchant_products[merchant_id] = {}
        self._category_index[merchant_id] = defaultdict(list)
        
        # Track category counts
        category_counts: Dict[str, int] = defaultdict(int)
        registered_count = 0
        
        for product in products:
            product_id = str(product.get("id", ""))
            if not product_id:
                logger.warning("Skipping product without ID")
                continue
            
            # Detect category (ML with keyword fallback)
            category, confidence, method = self._detect_category(product)
            
            # Find Amazon representatives
            amazon_reps = self._find_amazon_representatives(product, category)
            
            # Store product with mapping data
            product_data = {
                **product,
                "category": category,
                "category_confidence": round(confidence, 3),
                "category_method": method,
                "amazon_representatives": amazon_reps,
            }
            
            self._merchant_products[merchant_id][product_id] = product_data
            self._category_index[merchant_id][category].append(product_id)
            category_counts[category] += 1
            registered_count += 1
        
        result = {
            "registered": registered_count,
            "categories": dict(category_counts),
            "merchant_id": merchant_id
        }
        
        logger.info(f"Registration complete: {result}")
        return result
    
    def get_merchant_products(
        self,
        merchant_id: str,
        category: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all registered products for a merchant.
        
        Args:
            merchant_id: Merchant identifier
            category: Optional category filter
            
        Returns:
            List of product dictionaries
        """
        if merchant_id not in self._merchant_products:
            return []
        
        products = list(self._merchant_products[merchant_id].values())
        
        if category:
            products = [p for p in products if p.get("category") == category]
        
        return products
    
    def _get_product_data(
        self,
        merchant_id: str,
        product_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get product data for a merchant's product."""
        if merchant_id not in self._merchant_products:
            return None
        return self._merchant_products[merchant_id].get(str(product_id))
    
    def _build_weighted_query_vector(
        self,
        merchant_id: str,
        current_product_id: str,
        user_history: Optional[Dict[str, List[str]]],
        merchant_settings: Optional[Dict[str, Any]] = None
    ) -> Tuple[Optional[np.ndarray], str]:
        """
        Build a weighted query vector from user behavior.
        
        This is the CORE of personalization!
        
        Signal Hierarchy (from merchant settings or config defaults):
        - Past purchases: weight = purchaseHistory (default 0.7)
        - Cart items: weight = cartItems (default 0.5)
        - Current product: weight = currentProduct (default 0.3)
        - Recent views: weight = browsingHistory (default 0.1)
        
        The weighted average creates a query vector that:
        - Strongly reflects purchase history
        - Incorporates cart items
        - Incorporates current browsing context
        - Slightly considers recent views
        
        Args:
            merchant_id: Merchant identifier
            current_product_id: Currently viewed product ID
            user_history: Dict with 'viewed' and 'purchased' lists
            merchant_settings: Dict with weights from merchant settings
            
        Returns:
            Tuple of (query_vector, detected_category)
            query_vector is None if no embeddings found
        """
        model_loader = self._get_model_loader()
        
        if not model_loader.is_available:
            logger.warning("Model not available for query vector construction")
            return None, "home"
        
        # Build effective signal weights from merchant settings or fall back to config defaults
        effective_weights = dict(SIGNAL_WEIGHTS)  # copy defaults
        if merchant_settings and isinstance(merchant_settings, dict):
            ms_weights = merchant_settings.get("weights", {})
            if ms_weights and isinstance(ms_weights, dict):
                # Map merchant setting keys to internal signal keys
                key_map = {
                    "purchaseHistory": "purchased",
                    "cartItems": "added_to_cart",
                    "currentProduct": "current_product",
                    "browsingHistory": "viewed",
                }
                for ms_key, signal_key in key_map.items():
                    if ms_key in ms_weights:
                        try:
                            effective_weights[signal_key] = float(ms_weights[ms_key])
                        except (ValueError, TypeError):
                            pass
                logger.info(f"Using merchant signal weights: {effective_weights}")
        
        signal_embeddings: Dict[str, List[np.ndarray]] = {
            "current_product": [],
            "purchased": [],
            "added_to_cart": [],
            "viewed": [],
        }
        primary_category = None
        
        # 1. Get current product embedding
        current_product = None
        if current_product_id:
            current_product = self._get_product_data(merchant_id, current_product_id)
            
        if current_product:
            primary_category = current_product.get("category")
            amazon_reps = current_product.get("amazon_representatives", [])
            
            # Use top 3 representatives for current product
            for rep in amazon_reps:  # Use all representatives
                embedding = model_loader.get_embedding(rep)
                if embedding is not None:
                    signal_embeddings["current_product"].append(embedding)
        
        # 2. Get past purchases embeddings (weight = 0.7 - HIGHEST!)
        if user_history and user_history.get("purchased"):
            purchased = user_history["purchased"][-MAX_PURCHASED_HISTORY:]  # Last 5
            
            for purchased_id in purchased:
                product_data = self._get_product_data(merchant_id, purchased_id)
                if product_data:
                    amazon_reps = product_data.get("amazon_representatives", [])
                    
                    # Use all representatives per purchased product
                    for rep in amazon_reps:  # Use all representatives
                        embedding = model_loader.get_embedding(rep)
                        if embedding is not None:
                            signal_embeddings["purchased"].append(embedding)
        
        # 3. Get cart items embeddings (weight = 0.5 - HIGH intent!)
        if user_history and user_history.get("added_to_cart"):
            cart_items = user_history["added_to_cart"][-MAX_PURCHASED_HISTORY:]  # Last 5
            
            for cart_id in cart_items:
                # Skip if same as current product
                if cart_id == current_product_id:
                    continue
                    
                product_data = self._get_product_data(merchant_id, cart_id)
                if product_data:
                    # Cart is the strongest non-purchase signal — use its category
                    if primary_category is None:
                        primary_category = product_data.get("category")
                    amazon_reps = product_data.get("amazon_representatives", [])
                    
                    # Use all representatives for cart items
                    for rep in amazon_reps:
                        embedding = model_loader.get_embedding(rep)
                        if embedding is not None:
                            signal_embeddings["added_to_cart"].append(embedding)
        
        # 4. Get recent views embeddings (weight = 0.1)
        if user_history and user_history.get("viewed"):
            viewed = user_history["viewed"][-MAX_VIEWED_HISTORY:]  # Last 5
            
            for viewed_id in viewed:
                # Skip if same as current product
                if viewed_id == current_product_id:
                    continue
                    
                product_data = self._get_product_data(merchant_id, viewed_id)
                if product_data:
                    amazon_reps = product_data.get("amazon_representatives", [])
                    
                    # Use only top 1 representative for views (less important)
                    if amazon_reps:
                        embedding = model_loader.get_embedding(amazon_reps[0])
                        if embedding is not None:
                            signal_embeddings["viewed"].append(embedding)

        embeddings: List[np.ndarray] = []
        weights: List[float] = []
        for signal_key, signal_vectors in signal_embeddings.items():
            if not signal_vectors:
                continue
            signal_weight = float(effective_weights.get(signal_key, 0.0))
            if signal_weight <= 0:
                continue
            # Keep per-signal influence aligned with merchant slider intent.
            per_vector_weight = signal_weight / len(signal_vectors)
            embeddings.extend(signal_vectors)
            weights.extend([per_vector_weight] * len(signal_vectors))
        
        # Build weighted average
        if not embeddings:
            logger.warning("No embeddings found for query vector")
            return None, primary_category or "home"
        
        embeddings_array = np.array(embeddings)
        weights_array = np.array(weights, dtype=float)
        if not np.any(weights_array):
            weights_array = np.ones_like(weights_array)
        
        # Weighted average
        query_vector = np.average(embeddings_array, axis=0, weights=weights_array)
        
        # Normalize for cosine similarity
        norm = np.linalg.norm(query_vector)
        if norm > 0:
            query_vector = query_vector / norm
        
        logger.debug(f"Built query vector from {len(embeddings)} embeddings")
        logger.debug(
            "Signal contribution summary: %s",
            {
                signal: {
                    "vectors": len(signal_embeddings[signal]),
                    "weight": round(float(effective_weights.get(signal, 0.0)), 4),
                }
                for signal in ["current_product", "purchased", "added_to_cart", "viewed"]
            },
        )
        
        return query_vector, primary_category or "home"
    
    def _compute_tag_boost(
        self,
        current_product: Dict[str, Any],
        candidate_product: Dict[str, Any]
    ) -> float:
        """
        Compute a bonus score based on shared tags (Jaccard similarity).
        
        Products sharing more tags with the current product get a higher
        boost. This breaks ties among same-category products.
        
        Returns:
            Float between 0.0 and TAG_BOOST_WEIGHT (0.15)
        """
        current_tags = set(
            str(t).lower().strip()
            for t in current_product.get("tags", [])
            if t
        )
        candidate_tags = set(
            str(t).lower().strip()
            for t in candidate_product.get("tags", [])
            if t
        )
        
        if not current_tags or not candidate_tags:
            return 0.0
        
        # Jaccard similarity = |intersection| / |union|
        shared = current_tags & candidate_tags
        total = current_tags | candidate_tags
        
        if not total:
            return 0.0
        
        jaccard = len(shared) / len(total)
        return TAG_BOOST_WEIGHT * jaccard
    
    def _compute_price_proximity(
        self,
        current_product: Dict[str, Any],
        candidate_product: Dict[str, Any]
    ) -> float:
        """
        Compute a bonus score based on how close the candidate's price
        is to the current product's price (within ±30% window).
        
        Products priced closer to the current product get a higher boost.
        Products outside the ±30% window get 0 bonus (not removed).
        
        Returns:
            Float between 0.0 and PRICE_PROXIMITY_WEIGHT (0.10)
        """
        try:
            current_price = float(current_product.get("price", 0))
            candidate_price = float(candidate_product.get("price", 0))
        except (ValueError, TypeError):
            return 0.0
        
        if current_price <= 0:
            return 0.0
        
        # Compute how far the candidate is from current price
        price_diff = abs(current_price - candidate_price)
        allowed_range = current_price * PRICE_PROXIMITY_RANGE  # 30%
        
        if price_diff > allowed_range:
            return 0.0  # Outside window, no bonus
        
        # Linear scale: closer = higher bonus
        proximity_ratio = 1.0 - (price_diff / allowed_range)
        return PRICE_PROXIMITY_WEIGHT * proximity_ratio
    
    def get_recommendations(
        self,
        merchant_id: str,
        current_product_id: str,
        user_history: Optional[Dict[str, List[str]]] = None,
        user_location: Optional[str] = None,
        user_preferences: Optional[Dict[str, Any]] = None,
        k: int = DEFAULT_K,
        exclude_current: bool = True,
        exclude_viewed: bool = False,
        exclude_purchased: bool = True,
        merchant_settings: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get personalized product recommendations.
        
        Args:
            merchant_id: Shopify store identifier
            current_product_id: Currently viewed product ID
            user_history: Dict with viewed, added_to_cart, purchased
            user_location: User's country/region
            user_preferences: Dict with vegan, sustainable, price_range
            k: Number of recommendations to return
            exclude_current: If True, exclude the current_product_id from results
            exclude_viewed: If True, exclude all products from user_history['viewed']
            exclude_purchased: If True, exclude products from user_history['purchased']
            merchant_settings: Dict with filters, weights from merchant settings
            
        Returns:
            List of recommendation dictionaries
        """
        # Validate k
        k = min(max(1, k), MAX_K)
        
        logger.info(f"Getting {k} recommendations for merchant {merchant_id}")
        logger.info(f"  Current product: {current_product_id}")
        logger.info(
            f"  Exclude: current={exclude_current}, viewed={exclude_viewed}, purchased={exclude_purchased}"
        )
        
        # DEBUG LOGGING
        ms_filters_debug = {}
        if merchant_settings and isinstance(merchant_settings, dict):
            ms_filters_debug = merchant_settings.get("filters", {})
        logger.info(f"DEBUG: merchant_settings received: {merchant_settings}")
        logger.info(f"DEBUG: sameCategoryOnly = {ms_filters_debug.get('sameCategoryOnly', 'NOT SET (Defaults True)')}")

        ms_filters = {}
        if merchant_settings and isinstance(merchant_settings, dict):
            ms_filters = merchant_settings.get("filters", {})
        same_category_only = ms_filters.get("sameCategoryOnly", True)

        
        # Check if merchant is registered
        if merchant_id not in self._merchant_products:
            logger.warning(f"Merchant {merchant_id} not registered")
            return []
        
        # Build weighted query vector
        query_vector, target_category = self._build_weighted_query_vector(
            merchant_id=merchant_id,
            current_product_id=current_product_id,
            user_history=user_history,
            merchant_settings=merchant_settings
        )
        
        # If no query vector, fall back to popular products
        if query_vector is None:
            logger.info("No query vector, falling back to popular products")
            return self.get_popular_products(
                merchant_id=merchant_id,
                category=target_category if same_category_only else None,
                user_location=user_location,
                user_preferences=user_preferences,
                k=k,
                merchant_settings=merchant_settings,
            )
        
        # Get candidate products from merchant
        # Strategy:
        # - If on a product page (current_product_id set), filter by that product's category first
        # - If on homepage (no current_product_id), search ALL products globally
        #   so the weighted query vector (cart=0.5 > views=0.1) decides the results
        if current_product_id:
            # If sameCategoryOnly is False, we search GLOBALLY even on product pages
            # ensuring we don't miss matching products from other categories
            search_category = target_category if same_category_only else None
            
            candidate_products = self.get_merchant_products(
                merchant_id=merchant_id,
                category=search_category
            )
            if len(candidate_products) < k + 1 and same_category_only:
                logger.debug(
                    f"Category '{target_category}' has only {len(candidate_products)} candidates; "
                    "keeping strict same-category filtering."
                )
        else:
            # Homepage: global search across all categories
            logger.info("Homepage request — searching all products globally")
            candidate_products = self.get_merchant_products(merchant_id)
            target_category = None  # Don't filter by category in apply_all_filters
        
        logger.debug(f"Found {len(candidate_products)} candidates for search")
        
        # Exclusions
        to_exclude = []
        if exclude_current and current_product_id:
            to_exclude.append(current_product_id)
        
        if exclude_viewed and user_history and user_history.get("viewed"):
            to_exclude.extend(user_history["viewed"])
            
        # Exclude previously purchased products only when enabled.
        if exclude_purchased and user_history and user_history.get("purchased"):
            to_exclude.extend(user_history["purchased"])
            
        if to_exclude:
            candidate_products = exclude_products(candidate_products, to_exclude)
        
        # Apply filters (respecting merchant settings)
        filtered_products = apply_all_filters(
            products=candidate_products,
            user_location=user_location,
            user_preferences=user_preferences,
            target_category=target_category,
            merchant_settings=merchant_settings
        )
        
        if not filtered_products:
            logger.warning("No products passed filters")
            return []
        
        # Get current product data for tag/price boosting
        current_product = self._get_product_data(merchant_id, current_product_id) if current_product_id else None
        
        # Extract merchant filter settings for dynamic control
        # Determine if price proximity filter is enabled
        price_prox_cfg = ms_filters.get("priceProximity", {}) if ms_filters else {}
        price_prox_enabled = price_prox_cfg.get("enabled", True) if isinstance(price_prox_cfg, dict) else bool(price_prox_cfg)
        price_prox_range = float(price_prox_cfg.get("range", PRICE_PROXIMITY_RANGE)) if isinstance(price_prox_cfg, dict) else PRICE_PROXIMITY_RANGE
        
        # Hard price-proximity filter: on product pages, only keep
        # candidates within the configured range of the current product's price
        if current_product and current_product_id and price_prox_enabled:
            try:
                current_price = float(current_product.get("price", 0))
                if current_price > 0:
                    min_price = current_price * (1 - price_prox_range)
                    max_price = current_price * (1 + price_prox_range)
                    
                    price_filtered = []
                    for p in filtered_products:
                        try:
                            p_price = float(p.get("price", 0))
                            if min_price <= p_price <= max_price:
                                price_filtered.append(p)
                        except (ValueError, TypeError):
                            price_filtered.append(p)
                    
                    if price_filtered:
                        logger.info(
                            f"Price filter: {len(price_filtered)}/{len(filtered_products)} "
                            f"products within ${min_price:.2f}-${max_price:.2f}"
                        )
                        filtered_products = price_filtered
                    else:
                        logger.info("Price filter removed all products, keeping original list")
            except (ValueError, TypeError):
                pass
        
        # Determine if tag boost is enabled
        tag_boost_cfg = ms_filters.get("tagBoost", {}) if ms_filters else {}
        tag_boost_enabled = tag_boost_cfg.get("enabled", True) if isinstance(tag_boost_cfg, dict) else bool(tag_boost_cfg)
        tag_boost_weight = float(tag_boost_cfg.get("weight", TAG_BOOST_WEIGHT)) if isinstance(tag_boost_cfg, dict) else TAG_BOOST_WEIGHT
        
        # Score products using FAISS similarity + tag boost + price proximity
        model_loader = self._get_model_loader()
        scored_products: List[Tuple[Dict, float]] = []
        
        for product in filtered_products:
            # Get embeddings for this product via its Amazon representatives
            amazon_reps = product.get("amazon_representatives", [])
            
            if not amazon_reps:
                # No representatives, assign low score
                scored_products.append((product, MIN_SIMILARITY_SCORE))
                if str(product.get("id")) == "8143046279257":
                    logger.info("DEBUG: Missing Product has NO amazon representatives")
                continue
            
            # Get embeddings and compute similarity
            product_embeddings = []
            for rep in amazon_reps:  # Use all representatives
                embedding = model_loader.get_embedding(rep)
                if embedding is not None:
                    product_embeddings.append(embedding)
            
            if not product_embeddings:
                if str(product.get("id")) == "8143046279257":
                     logger.info("DEBUG: Missing Product has representatives but NO embeddings found")
                scored_products.append((product, MIN_SIMILARITY_SCORE))
                continue
            
            # Average the representative embeddings
            product_vector = np.mean(product_embeddings, axis=0)
            
            # Normalize
            norm = np.linalg.norm(product_vector)
            if norm > 0:
                product_vector = product_vector / norm
            
            # Compute cosine similarity (base score)
            similarity = float(np.dot(query_vector, product_vector))
            
            if similarity >= MIN_SIMILARITY_SCORE:
                # Apply tag-boost and price-proximity bonuses (if enabled)
                tag_boost = 0.0
                price_boost = 0.0
                
                if current_product:
                    if tag_boost_enabled:
                        tag_boost = self._compute_tag_boost(current_product, product)
                        # Scale by merchant-configured weight
                        if tag_boost_weight != TAG_BOOST_WEIGHT and tag_boost > 0:
                            tag_boost = tag_boost / TAG_BOOST_WEIGHT * tag_boost_weight
                    if price_prox_enabled:
                        price_boost = self._compute_price_proximity(current_product, product)
                
                final_score = similarity + tag_boost + price_boost
                scored_products.append((product, final_score))
        
        # Sort by score descending
        scored_products.sort(key=lambda x: x[1], reverse=True)
        
        # DEBUG: Log top candidates
        logger.info(f"DEBUG: Top 5 candidates:")
        for i, (p, s) in enumerate(scored_products[:5]):
            logger.info(f"  {i+1}. {p.get('title')} ({p.get('id')}): {s:.4f}")

        # DEBUG: Check specific missing product
        missing_id = "8143046279257"
        # Fix: substring match to handle gid://...
        missing_p = next((p for p, s in scored_products if missing_id in str(p.get("id"))), None)
        if missing_p:
            missing_score = next(s for p, s in scored_products if missing_id in str(p.get("id")))
            logger.info(f"DEBUG: Missing Product {missing_id} IS in scored list. Score: {missing_score:.4f}")
            # Recalculate components for debug
            similarity = 0.0 # Placeholder, hard to get back without refactoring
            tag_boost = 0.0
            if current_product and tag_boost_enabled:
                 tag_boost = self._compute_tag_boost(current_product, missing_p)
                 if tag_boost_weight != TAG_BOOST_WEIGHT and tag_boost > 0:
                     tag_boost = tag_boost / TAG_BOOST_WEIGHT * tag_boost_weight
            logger.info(f"  - Tag boost component: {tag_boost:.4f} (Weight: {tag_boost_weight})")
            logger.info(f"  - Tags: {missing_p.get('tags')}")
            logger.info(f"  - Current Tags: {current_product.get('tags')}")
        else:
            logger.info(f"DEBUG: Missing Product {missing_id} is NOT in scored list (filtered out earlier?)")
            
        # Take top k
        top_products = scored_products[:k]
        
        # Build response
        recommendations = []
        for product, score in top_products:
            # Generate recommendation reason
            reason = self._generate_recommendation_reason(
                product=product,
                current_product_id=current_product_id,
                user_history=user_history
            )
            
            recommendations.append({
                "shopify_product_id": product.get("id"),
                "title": product.get("title", ""),
                "category": product.get("category", ""),
                "price": product.get("price", "0"),
                "image": product.get("image", ""),
                "tags": product.get("tags", []),
                "score": round(score, 3),
                "reason": reason
            })
        
        logger.info(f"Returning {len(recommendations)} recommendations")
        return recommendations
    
    def _generate_recommendation_reason(
        self,
        product: Dict[str, Any],
        current_product_id: str,
        user_history: Optional[Dict[str, List[str]]]
    ) -> str:
        """
        Generate a human-readable reason for the recommendation.
        
        Args:
            product: Recommended product
            current_product_id: Currently viewed product
            user_history: User's history
            
        Returns:
            Recommendation reason string
        """
        # Check if based on purchase history
        if user_history and user_history.get("purchased"):
            return "Based on your purchase history"
        
        # Check if similar to current product
        if current_product_id:
            return f"Similar to what you're viewing"
        
        # Check if based on browsing
        if user_history and user_history.get("viewed"):
            return "Based on your recent views"
        
        # Default
        return "Popular in this category"
    
    def get_popular_products(
        self,
        merchant_id: str,
        category: Optional[str] = None,
        user_location: Optional[str] = None,
        user_preferences: Optional[Dict[str, Any]] = None,
        k: int = DEFAULT_K,
        merchant_settings: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get popular products for cold start scenarios.
        
        Used when:
        - New user with no history
        - No query vector can be built
        - Explicit request for popular products
        
        Args:
            merchant_id: Merchant identifier
            category: Optional category filter
            user_location: User's location for filtering
            user_preferences: User's preferences for filtering
            k: Number of products to return
            merchant_settings: Dict with filter toggles from merchant settings
            
        Returns:
            List of popular products
        """
        logger.info(f"Getting {k} popular products for {merchant_id}")
        
        filters_cfg = {}
        if merchant_settings and isinstance(merchant_settings, dict):
            filters_cfg = merchant_settings.get("filters", {})

        same_category_only = filters_cfg.get("sameCategoryOnly", True)
        effective_category = category if same_category_only else None

        # Get merchant products with optional category scope.
        products = self.get_merchant_products(merchant_id, effective_category)
        
        if len(products) < k and effective_category:
            logger.debug(
                f"Category '{effective_category}' has only {len(products)} products; "
                "keeping strict same-category filtering."
            )
        
        # Apply filters
        filtered = apply_all_filters(
            products=products,
            user_location=user_location,
            user_preferences=user_preferences,
            target_category=effective_category,
            merchant_settings=merchant_settings,
        )
        
        # For now, return first k (could add popularity scoring later)
        popular = filtered[:k]
        
        # Format response
        return [
            {
                "shopify_product_id": p.get("id"),
                "title": p.get("title", ""),
                "category": p.get("category", ""),
                "price": p.get("price", "0"),
                "image": p.get("image", ""),
                "tags": p.get("tags", []),
                "score": 1.0,  # Popular products get max score
                "reason": "Popular in this category"
            }
            for p in popular
        ]
    
    def clear_merchant(self, merchant_id: str) -> bool:
        """
        Clear all products for a merchant.
        
        Args:
            merchant_id: Merchant to clear
            
        Returns:
            True if cleared, False if not found
        """
        if merchant_id in self._merchant_products:
            del self._merchant_products[merchant_id]
            if merchant_id in self._category_index:
                del self._category_index[merchant_id]
            logger.info(f"Cleared merchant {merchant_id}")
            return True
        return False


# Singleton accessor function
def get_recommender() -> ProductRecommender:
    """
    Get the singleton ProductRecommender instance.
    
    Usage:
        recommender = get_recommender()
        recommender.register_merchant_products(...)
        recs = recommender.get_recommendations(...)
    """
    return ProductRecommender.get_instance()
