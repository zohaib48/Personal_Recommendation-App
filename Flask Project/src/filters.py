"""
Filtering System for Shopify AI Recommendations.

This module provides filtering capabilities for recommendations:
1. Location-based filtering (climate-appropriate products)
2. Ethical preference filtering (vegan, sustainable)
3. Price range filtering

Filters are applied AFTER FAISS similarity search to ensure
recommendations match user preferences and constraints.
"""

import logging
from typing import Dict, List, Any, Optional

# Import configuration
from config import (
    HOT_CLIMATE_REGIONS,
    COLD_CLIMATE_REGIONS,
    HOT_CLIMATE_ISO_CODES,
    COLD_CLIMATE_ISO_CODES,
    WINTER_TAGS,
    SUMMER_TAGS,
    VEGAN_TAGS,
    SUSTAINABLE_TAGS,
    PRICE_RANGES,
)

logger = logging.getLogger(__name__)


def _normalize_location(location: str) -> str:
    """
    Normalize location string for comparison.
    
    Args:
        location: User's location (country, region, or city)
        
    Returns:
        Lowercase, stripped location string
    """
    if not location:
        return ""
    return location.lower().strip()


def _get_product_tags(product: Dict[str, Any]) -> List[str]:
    """
    Extract and normalize tags from a product.
    
    Args:
        product: Product dictionary with 'tags' field
        
    Returns:
        List of lowercase tag strings
    """
    tags = product.get("tags", [])
    
    # Handle both string and list formats
    if isinstance(tags, str):
        # Split comma-separated tags
        tags = [t.strip() for t in tags.split(",")]
    
    # Normalize all tags
    return [str(t).lower().strip() for t in tags if t]


def _get_product_text(product: Dict[str, Any]) -> str:
    """
    Get combined text from product for matching.
    
    Combines title, product_type, and tags into a single
    lowercase string for keyword matching.
    
    Args:
        product: Product dictionary
        
    Returns:
        Combined lowercase text
    """
    parts = [
        product.get("title", ""),
        product.get("product_type", ""),
    ]
    
    # Add tags
    tags = _get_product_tags(product)
    parts.extend(tags)
    
    return " ".join(str(p).lower() for p in parts if p)


def _has_any_tag(product: Dict[str, Any], target_tags: List[str]) -> bool:
    """
    Check if product has any of the target tags.
    
    Checks both the tags field and the full product text
    (title, product_type) for flexibility.
    
    Args:
        product: Product dictionary
        target_tags: List of tags to check for
        
    Returns:
        True if any target tag is found
    """
    product_text = _get_product_text(product)
    
    for tag in target_tags:
        if tag.lower() in product_text:
            return True
    
    return False


def apply_location_filter(
    products: List[Dict[str, Any]],
    user_location: Optional[str]
) -> List[Dict[str, Any]]:
    """
    Filter products based on user's location/climate.
    
    For users in hot climates (Pakistan, India, UAE, etc.):
    - Excludes winter items (wool coats, snow boots, etc.)
    
    For users in cold climates (Canada, UK, Russia, etc.):
    - Excludes summer-only items (swimwear, beach items, etc.)
    
    Args:
        products: List of product dictionaries to filter
        user_location: User's country/region (e.g., "Pakistan", "Canada")
        
    Returns:
        Filtered list of products appropriate for the climate
        
    Example:
        >>> products = [
        ...     {"id": "1", "title": "Wool Winter Coat", "tags": ["winter", "coat"]},
        ...     {"id": "2", "title": "Organic Moisturizer", "tags": ["skincare"]},
        ... ]
        >>> filtered = apply_location_filter(products, "Pakistan")
        >>> len(filtered)  # Only moisturizer, wool coat filtered out
        1
    """
    if not user_location:
        logger.debug("No location provided, skipping location filter")
        return products
    
    location = _normalize_location(user_location)
    
    if not location:
        return products
    
    # Shopify storefront commonly sends ISO country codes (e.g. "AR", "PK").
    location_parts = location.split("-")
    country_hint = location_parts[0]
    is_iso_country_code = len(country_hint) == 2 and country_hint.isalpha()

    # Determine climate zone.
    if is_iso_country_code:
        is_hot_climate = country_hint in HOT_CLIMATE_ISO_CODES
        is_cold_climate = country_hint in COLD_CLIMATE_ISO_CODES
    else:
        is_hot_climate = any(hot in location for hot in HOT_CLIMATE_REGIONS)
        is_cold_climate = any(cold in location for cold in COLD_CLIMATE_REGIONS)
    
    if not is_hot_climate and not is_cold_climate:
        # Unknown climate, don't filter
        logger.debug(f"Location '{user_location}' has no climate mapping, skipping filter")
        return products
    
    # Define tags to exclude based on climate
    if is_hot_climate:
        exclude_tags = WINTER_TAGS
        climate_type = "hot"
    else:
        exclude_tags = SUMMER_TAGS
        climate_type = "cold"
    
    logger.debug(f"Applying {climate_type} climate filter for {user_location}")
    
    # Filter products
    filtered = []
    excluded_count = 0
    
    for product in products:
        if _has_any_tag(product, exclude_tags):
            excluded_count += 1
            logger.debug(f"Excluded product '{product.get('id')}' - climate mismatch")
        else:
            filtered.append(product)
    
    if excluded_count > 0:
        logger.info(f"Location filter: excluded {excluded_count} products for {user_location}")
    
    return filtered


def apply_vegan_filter(products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Filter to include only vegan/cruelty-free products.
    
    Keeps products that have vegan-related tags:
    - vegan, cruelty-free, plant-based, etc.
    
    Args:
        products: List of product dictionaries
        
    Returns:
        Products with vegan/cruelty-free tags only
    """
    filtered = []
    
    for product in products:
        if _has_any_tag(product, VEGAN_TAGS):
            filtered.append(product)
    
    logger.info(f"Vegan filter: {len(filtered)}/{len(products)} products passed")
    return filtered


def apply_sustainable_filter(products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Filter to include only sustainable/eco-friendly products.
    
    Keeps products that have sustainability-related tags:
    - sustainable, eco-friendly, organic, recycled, etc.
    
    Args:
        products: List of product dictionaries
        
    Returns:
        Products with sustainability tags only
    """
    filtered = []
    
    for product in products:
        if _has_any_tag(product, SUSTAINABLE_TAGS):
            filtered.append(product)
    
    logger.info(f"Sustainable filter: {len(filtered)}/{len(products)} products passed")
    return filtered


def apply_price_filter(
    products: List[Dict[str, Any]],
    price_range: Optional[str]
) -> List[Dict[str, Any]]:
    """
    Filter products by price range.
    
    Price ranges:
    - "low": $0 - $50
    - "medium": $20 - $100
    - "high": $100+
    
    Args:
        products: List of product dictionaries with 'price' field
        price_range: One of "low", "medium", "high"
        
    Returns:
        Products within the specified price range
    """
    if not price_range or price_range not in PRICE_RANGES:
        return products
    
    range_config = PRICE_RANGES[price_range]
    min_price = range_config["min"]
    max_price = range_config["max"]
    
    filtered = []
    
    for product in products:
        try:
            # Parse price - handle string format
            price_str = str(product.get("price", "0"))
            # Remove currency symbols and whitespace
            price_str = price_str.replace("$", "").replace(",", "").strip()
            price = float(price_str)
            
            if min_price <= price <= max_price:
                filtered.append(product)
                
        except (ValueError, TypeError) as e:
            # If price can't be parsed, include the product
            logger.debug(f"Could not parse price for product {product.get('id')}: {e}")
            filtered.append(product)
    
    logger.info(f"Price filter ({price_range}): {len(filtered)}/{len(products)} products passed")
    return filtered


def apply_ethical_filters(
    products: List[Dict[str, Any]],
    user_preferences: Optional[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Apply all ethical and preference-based filters.
    
    Handles the following preferences:
    - vegan: Only include vegan/cruelty-free products
    - sustainable: Only include eco-friendly products
    - price_range: Filter by price tier
    
    Args:
        products: List of product dictionaries
        user_preferences: Dict with preference flags:
            - vegan (bool): Filter for vegan products
            - sustainable (bool): Filter for sustainable products
            - price_range (str): "low", "medium", or "high"
            
    Returns:
        Products matching all specified preferences
        
    Example:
        >>> prefs = {"vegan": True, "price_range": "medium"}
        >>> filtered = apply_ethical_filters(products, prefs)
    """
    if not user_preferences:
        return products
    
    filtered = products
    
    # Apply vegan filter if requested
    if user_preferences.get("vegan"):
        filtered = apply_vegan_filter(filtered)
    
    # Apply sustainable filter if requested
    if user_preferences.get("sustainable"):
        filtered = apply_sustainable_filter(filtered)
    
    # Apply price range filter
    price_range = user_preferences.get("price_range")
    if price_range:
        filtered = apply_price_filter(filtered, price_range)
    
    return filtered


def apply_category_filter(
    products: List[Dict[str, Any]],
    target_category: str,
    allow_complementary: bool = True
) -> List[Dict[str, Any]]:
    """
    Filter products to match or complement the target category.
    
    This ensures we don't recommend electronics when viewing beauty products.
    
    Category relationships (when allow_complementary=True):
    - beauty → beauty only
    - fashion → fashion only  
    - electronics → electronics only
    - home → home only
    
    Args:
        products: List of product dictionaries with 'category' field
        target_category: The category to match (e.g., "beauty")
        allow_complementary: If True, include related categories
        
    Returns:
        Products in matching category
    """
    if not target_category:
        return products
    
    target = target_category.lower().strip()
    
    # Define complementary categories (for future enhancement)
    # Currently keeping same-category only for precision
    allowed_categories = {target}
    
    if allow_complementary:
        # Could add complementary mappings here
        # For now, keep strict same-category matching
        pass
    
    filtered = []
    
    for product in products:
        product_category = str(product.get("category", "")).lower().strip()
        if product_category in allowed_categories:
            filtered.append(product)
    
    logger.debug(f"Category filter: {len(filtered)}/{len(products)} in {target_category}")
    return filtered


def apply_all_filters(
    products: List[Dict[str, Any]],
    user_location: Optional[str] = None,
    user_preferences: Optional[Dict[str, Any]] = None,
    target_category: Optional[str] = None,
    merchant_settings: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Apply all filters in the correct order, respecting merchant settings.
    
    Filter order (most to least restrictive):
    1. Category filter (must match category) — controlled by sameCategoryOnly
    2. Location filter (climate-appropriate) — controlled by locationFilter.enabled
    3. Ethical filters (vegan, sustainable, price) — controlled by ethicalFilter.enabled
    
    Args:
        products: List of product dictionaries
        user_location: User's country/region for climate filtering
        user_preferences: Dict with vegan, sustainable, price_range
        target_category: Category to match
        merchant_settings: Dict with filter toggles from merchant settings
        
    Returns:
        Products passing all applicable filters
    """
    logger.info(f"Applying filters to {len(products)} products")
    
    # Extract filter settings (default to all enabled for backwards compat)
    filters_config = {}
    if merchant_settings and isinstance(merchant_settings, dict):
        filters_config = merchant_settings.get("filters", {})
    
    filtered = products
    
    # 1. Category filter — controlled by sameCategoryOnly
    same_category = True  # default
    if filters_config:
        same_category = filters_config.get("sameCategoryOnly", True)
    
    if target_category and same_category:
        filtered = apply_category_filter(filtered, target_category)
        logger.debug(f"After category filter: {len(filtered)} products")
        if any(str(p.get("id")) == "8143046279257" for p in products) and \
           not any(str(p.get("id")) == "8143046279257" for p in filtered):
            logger.info(f"DEBUG: Missing Product DROPPED by Category Filter (Target: {target_category})")
    
    # 2. Location filter — controlled by locationFilter.enabled
    location_enabled = True  # default
    if filters_config:
        loc_cfg = filters_config.get("locationFilter", {})
        if isinstance(loc_cfg, dict):
            location_enabled = loc_cfg.get("enabled", True)
        elif isinstance(loc_cfg, bool):
            location_enabled = loc_cfg
    
    if user_location and location_enabled:
        filtered = apply_location_filter(filtered, user_location)
        logger.debug(f"After location filter: {len(filtered)} products")
        if any(str(p.get("id")) == "8143046279257" for p in products) and \
           not any(str(p.get("id")) == "8143046279257" for p in filtered):
            logger.info(f"DEBUG: Missing Product DROPPED by Location Filter (UserLoc: {user_location})")
    
    # 3. Ethical/preference filters — controlled by ethicalFilter.enabled
    ethical_enabled = False  # default OFF
    if filters_config:
        eth_cfg = filters_config.get("ethicalFilter", {})
        if isinstance(eth_cfg, dict):
            ethical_enabled = eth_cfg.get("enabled", False)
            # Override user_preferences with merchant-level ethical settings
            if ethical_enabled and not user_preferences:
                user_preferences = {}
            if ethical_enabled and user_preferences is not None:
                if eth_cfg.get("vegan"):
                    user_preferences["vegan"] = True
                if eth_cfg.get("sustainable"):
                    user_preferences["sustainable"] = True
        elif isinstance(eth_cfg, bool):
            ethical_enabled = eth_cfg
    
    if user_preferences and ethical_enabled:
        filtered = apply_ethical_filters(filtered, user_preferences)
        logger.debug(f"After ethical filters: {len(filtered)} products")
        if any(str(p.get("id")) == "8143046279257" for p in products) and \
           not any(str(p.get("id")) == "8143046279257" for p in filtered):
            logger.info("DEBUG: Missing Product DROPPED by Ethical/Price Filters")

    elif user_preferences and not filters_config:
        # Backwards compat: if no merchant_settings, apply as before
        filtered = apply_ethical_filters(filtered, user_preferences)
        logger.debug(f"After ethical filters (legacy): {len(filtered)} products")
    
    logger.info(f"Filters complete: {len(filtered)}/{len(products)} products passed")
    
    return filtered


def exclude_products(
    products: List[Dict[str, Any]],
    exclude_ids: List[str]
) -> List[Dict[str, Any]]:
    """
    Exclude specific products from the list.
    
    Useful for excluding:
    - The current product (don't recommend what they're viewing)
    - Products already in cart
    - Products already purchased
    
    Args:
        products: List of product dictionaries
        exclude_ids: List of product IDs to exclude
        
    Returns:
        Products not in the exclude list
    """
    if not exclude_ids:
        return products
    
    exclude_set = set(str(id) for id in exclude_ids)
    
    return [p for p in products if str(p.get("id")) not in exclude_set]
