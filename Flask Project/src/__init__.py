"""
Source module for Shopify AI Recommendation System.

This module contains:
- model_loader: FAISS index and metadata loading (NO TensorFlow required)
- recommender: Core recommendation engine
- filters: Location, ethical, and price filtering
"""

from .model_loader import ModelLoader, get_model_loader
from .recommender import ProductRecommender, get_recommender
from .filters import apply_all_filters, apply_location_filter, apply_ethical_filters

__all__ = [
    "ModelLoader",
    "get_model_loader",
    "ProductRecommender",
    "get_recommender",
    "apply_all_filters",
    "apply_location_filter",
    "apply_ethical_filters",
]
