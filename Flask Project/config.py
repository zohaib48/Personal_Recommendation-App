"""
Configuration for Shopify AI Recommendation System.

This file contains all configuration constants including:
- Model file paths
- Category keyword mappings for detection
- Climate regions for location filtering
- Recommendation parameters and weights
"""

import os
from pathlib import Path

# =============================================================================
# PATH CONFIGURATION
# =============================================================================

# Base directory (project root)
BASE_DIR = Path(__file__).parent.absolute()

# Model directory containing trained model files
MODEL_DIR = BASE_DIR / "model"

# Model file paths
MODEL_PATHS = {
    "checkpoint": MODEL_DIR / "checkpoints" / "best_model.h5",
    "training_data": MODEL_DIR / "training_data.csv",
    "faiss_index": MODEL_DIR / "production_index.faiss",
    "embeddings": MODEL_DIR / "production_embeddings.npy",
    "product_ids": MODEL_DIR / "production_product_ids.npy",
    "metadata": MODEL_DIR / "production_metadata.json",          # legacy (can be deleted)
    "category_map": MODEL_DIR / "category_product_map.json",     # compact replacement
    "category_classifier": MODEL_DIR / "category_classifier.pkl", # ML classifier
}


# =============================================================================
# MODEL ARCHITECTURE CONFIGURATION (MUST MATCH TRAINING EXACTLY)
# =============================================================================

MODEL_CONFIG = {
    "embedding_dim": 128,      # User/Product embedding dimension
    "output_dim": 64,          # Final output dimension for FAISS
    "category_embedding_dim": 32,  # Category embedding dimension
    "categories": ["fashion", "beauty", "electronics", "home"],
}


# =============================================================================
# CATEGORY KEYWORD MAPPINGS
# Used to detect category from product title, type, and tags
# =============================================================================

CATEGORY_KEYWORDS = {
    "beauty": [
        "skincare", "moisturizer", "serum", "cream", "lotion", "face", "skin",
        "beauty", "cosmetic", "makeup", "lipstick", "mascara", "foundation",
        "cleanser", "toner", "sunscreen", "spf", "anti-aging", "wrinkle",
        "hydrating", "facial", "eye cream", "night cream", "day cream",
        "exfoliant", "mask", "peel", "vitamin c", "retinol", "hyaluronic",
        "collagen", "niacinamide", "salicylic", "benzoyl", "acne", "blemish",
        "fragrance", "perfume", "cologne", "deodorant", "body wash", "shampoo",
        "conditioner", "hair", "nail", "polish", "manicure", "pedicure"
    ],
    "fashion": [
        "clothing", "apparel", "shirt", "pants", "dress", "skirt", "coat",
        "jacket", "sweater", "hoodie", "jeans", "shorts", "blouse", "top",
        "bottom", "suit", "blazer", "cardigan", "vest", "polo", "tee",
        "t-shirt", "underwear", "socks", "shoes", "boots", "sneakers",
        "sandals", "heels", "flats", "loafers", "accessories", "belt",
        "scarf", "hat", "cap", "gloves", "bag", "purse", "handbag",
        "backpack", "wallet", "watch", "jewelry", "necklace", "bracelet",
        "earrings", "ring", "sunglasses", "winter", "summer", "wool",
        "cotton", "leather", "denim", "silk", "linen", "cashmere"
    ],
    "electronics": [
        "phone", "smartphone", "iphone", "android", "samsung", "pixel",
        "tablet", "ipad", "laptop", "computer", "pc", "macbook", "desktop",
        "monitor", "keyboard", "mouse", "headphones", "earbuds", "airpods",
        "speaker", "bluetooth", "wireless", "charger", "cable", "adapter",
        "case", "cover", "screen protector", "stand", "dock", "hub",
        "usb", "hdmi", "power bank", "battery", "camera", "webcam",
        "microphone", "gaming", "controller", "console", "playstation",
        "xbox", "nintendo", "smart", "watch", "fitness", "tracker",
        "tv", "television", "streaming", "roku", "fire stick", "chromecast"
    ],
    "home": [
        "home", "house", "kitchen", "bedroom", "bathroom", "living room",
        "furniture", "decor", "decoration", "pillow", "cushion", "blanket",
        "throw", "rug", "carpet", "curtain", "blind", "lamp", "light",
        "candle", "vase", "frame", "mirror", "clock", "storage", "organizer",
        "shelf", "rack", "hook", "basket", "bin", "container", "jar",
        "plate", "bowl", "cup", "mug", "glass", "utensil", "cutlery",
        "pot", "pan", "cookware", "bakeware", "appliance", "blender",
        "mixer", "toaster", "coffee", "kettle", "towel", "mat", "shower",
        "soap", "dispenser", "trash", "laundry", "cleaning", "garden",
        "outdoor", "patio", "grill", "bbq", "plant", "planter", "tool"
    ],
}


# =============================================================================
# LOCATION-BASED FILTERING
# Climate regions for filtering seasonal/climate-inappropriate products
# =============================================================================

HOT_CLIMATE_REGIONS = [
    # South Asia
    "pakistan", "india", "bangladesh", "sri lanka", "nepal",
    # Middle East
    "uae", "united arab emirates", "saudi arabia", "qatar", "bahrain",
    "kuwait", "oman", "yemen", "jordan", "iraq",
    # Southeast Asia
    "thailand", "vietnam", "philippines", "indonesia", "malaysia",
    "singapore", "cambodia", "myanmar", "laos",
    # Africa
    "egypt", "nigeria", "kenya", "south africa", "morocco", "ghana",
    "ethiopia", "tanzania", "uganda", "senegal",
    # Americas
    "brazil", "mexico", "colombia", "venezuela", "peru", "ecuador",
    "cuba", "dominican republic", "puerto rico", "jamaica",
    # Oceania
    "australia", "fiji", "hawaii",
]

COLD_CLIMATE_REGIONS = [
    # North America
    "canada", "alaska",
    # Europe
    "uk", "united kingdom", "england", "scotland", "ireland",
    "norway", "sweden", "finland", "denmark", "iceland",
    "russia", "poland", "germany", "netherlands", "belgium",
    "switzerland", "austria", "czech republic",
    # Asia
    "japan", "south korea", "mongolia", "kazakhstan",
    # Southern Hemisphere Winter
    "argentina", "chile", "new zealand",
]

# ISO 3166-1 alpha-2 shortcuts used by Shopify localization.country.iso_code.
# Kept lowercase to match normalized request values.
HOT_CLIMATE_ISO_CODES = {
    "pk", "in", "bd", "lk", "np",
    "ae", "sa", "qa", "bh", "kw", "om", "ye", "jo", "iq",
    "th", "vn", "ph", "id", "my", "sg", "kh", "mm", "la",
    "eg", "ng", "ke", "za", "ma", "gh", "et", "tz", "ug", "sn",
    "br", "mx", "co", "ve", "pe", "ec", "cu", "do", "pr", "jm",
    "au", "fj",
}

COLD_CLIMATE_ISO_CODES = {
    "ca", "gb", "ie",
    "no", "se", "fi", "dk", "is",
    "ru", "pl", "de", "nl", "be", "ch", "at", "cz",
    "jp", "kr", "mn", "kz",
    "ar", "cl", "nz",
}

# Tags to filter for hot climate users (skip winter items)
WINTER_TAGS = [
    "winter", "wool", "snow", "cold", "warm", "thermal", "fleece",
    "parka", "down jacket", "heavy coat", "fur", "cashmere",
    "beanie", "mittens", "scarf", "earmuffs", "boots",
]

# Tags to filter for cold climate users (skip summer-only items)
SUMMER_TAGS = [
    "summer", "beach", "swimwear", "bikini", "swimsuit", "pool",
    "tropical", "cooling", "lightweight", "sleeveless", "shorts",
    "sandals", "flip flops", "tank top", "sunhat", "visor",
]


# =============================================================================
# ETHICAL/PREFERENCE FILTERS
# Tags for vegan, sustainable, and other ethical preferences
# =============================================================================

VEGAN_TAGS = [
    "vegan", "cruelty-free", "cruelty free", "plant-based", "plant based",
    "no animal", "animal-free", "not tested on animals", "peta approved",
    "leaping bunny", "vegan friendly", "100% vegan",
]

SUSTAINABLE_TAGS = [
    "sustainable", "eco-friendly", "eco friendly", "organic", "recycled",
    "biodegradable", "compostable", "zero waste", "plastic-free",
    "fair trade", "ethically sourced", "carbon neutral", "renewable",
    "upcycled", "natural", "green", "environmentally friendly",
    "earth friendly", "b corp", "certified organic",
]


# =============================================================================
# PRICE RANGE CONFIGURATION
# =============================================================================

PRICE_RANGES = {
    "low": {"min": 0, "max": 50},
    "medium": {"min": 20, "max": 100},
    "high": {"min": 100, "max": float("inf")},
}


# =============================================================================
# RECOMMENDATION PARAMETERS
# =============================================================================

# Default number of recommendations to return
DEFAULT_K = 10

# Maximum number of recommendations allowed
MAX_K = 50

# Signal weights for building query vector
# Higher weight = more influence on recommendations
SIGNAL_WEIGHTS = {
    "current_product": 0.3,    # Product currently being viewed
    "purchased": 0.7,          # Past purchases (HIGHEST - proven preferences)
    "added_to_cart": 0.5,      # Products in cart (HIGH - strong intent to buy)
    "viewed": 0.1,             # Recently viewed products (casual browsing)
}

# Number of Amazon representatives to use per Shopify product
AMAZON_REPS_PER_PRODUCT = 3

# Number of user history items to consider
MAX_PURCHASED_HISTORY = 5
MAX_VIEWED_HISTORY = 5

# Minimum similarity score to include in recommendations
MIN_SIMILARITY_SCORE = 0.1

# Tag-boost: bonus score for products sharing tags with the current product
# Final bonus = TAG_BOOST_WEIGHT × (shared_tags / total_unique_tags)
TAG_BOOST_WEIGHT = 0.15

# Price-proximity: bonus score for products priced close to the current product
# Final bonus = PRICE_PROXIMITY_WEIGHT × (1 - |price_diff| / allowed_range)
PRICE_PROXIMITY_WEIGHT = 0.10

# Price window: candidates within ±30% of current product price get a bonus
PRICE_PROXIMITY_RANGE = 0.30


# =============================================================================
# API CONFIGURATION
# =============================================================================

API_CONFIG = {
    "host": os.getenv("FLASK_HOST", "0.0.0.0"),
    "port": int(os.getenv("FLASK_PORT", 5001)),
    "debug": os.getenv("FLASK_DEBUG", "false").lower() == "true",
}


# =============================================================================
# LOGGING CONFIGURATION
# =============================================================================

LOGGING_CONFIG = {
    "level": os.getenv("LOG_LEVEL", "INFO"),
    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
}
