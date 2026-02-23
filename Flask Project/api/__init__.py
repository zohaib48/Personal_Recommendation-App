"""
API module for Shopify AI Recommendation System.

This module contains the Flask application and API endpoints.
"""

from .app import app, create_app

__all__ = ["app", "create_app"]
