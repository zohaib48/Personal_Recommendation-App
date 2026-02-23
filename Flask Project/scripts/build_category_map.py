"""
Build compact category-to-product-IDs map from production_metadata.json.

This replaces the 101MB metadata file with a ~1MB category map.
The map stores product IDs sorted by popularity within each category.

Usage:
    python scripts/build_category_map.py

Output:
    model/category_product_map.json
"""

import json
import os
import sys
from pathlib import Path
from collections import defaultdict

# Project root
PROJECT_ROOT = Path(__file__).parent.parent
MODEL_DIR = PROJECT_ROOT / "model"
METADATA_PATH = MODEL_DIR / "production_metadata.json"
OUTPUT_PATH = MODEL_DIR / "category_product_map.json"


def build_category_map():
    """Build compact category map from production metadata."""
    print(f"Loading metadata from {METADATA_PATH}...")

    if not METADATA_PATH.exists():
        print(f"ERROR: {METADATA_PATH} not found")
        sys.exit(1)

    with open(METADATA_PATH, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    print(f"Loaded {len(metadata)} products")

    # Build category -> [(product_id, popularity)] mapping
    category_products = defaultdict(list)
    for pid, meta in metadata.items():
        category = meta.get("category", "unknown")
        popularity = meta.get("popularity", meta.get("interaction_count", 0))
        category_products[category].append((pid, popularity))

    # Sort by popularity descending and keep only product IDs
    category_map = {}
    for category, products in category_products.items():
        products.sort(key=lambda x: x[1], reverse=True)
        category_map[category] = [pid for pid, _ in products]

    # Print stats
    print("\nCategory distribution:")
    for cat, pids in sorted(category_map.items(), key=lambda x: -len(x[1])):
        print(f"  {cat}: {len(pids)} products")
    print(f"Total: {sum(len(v) for v in category_map.values())} products")

    # Save compact map
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(category_map, f)

    # Report sizes
    meta_size = METADATA_PATH.stat().st_size / (1024 * 1024)
    map_size = OUTPUT_PATH.stat().st_size / (1024 * 1024)
    print(f"\nOriginal metadata: {meta_size:.1f} MB")
    print(f"Compact map:       {map_size:.1f} MB")
    print(f"Size reduction:    {(1 - map_size / meta_size) * 100:.1f}%")
    print(f"\nSaved to: {OUTPUT_PATH}")
    print("\nYou can now safely delete production_metadata.json:")
    print(f"  rm \"{METADATA_PATH}\"")


if __name__ == "__main__":
    build_category_map()
