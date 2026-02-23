"""
Model Loader for Shopify AI Recommendation System.

MINIMAL DEPLOYMENT VERSION - Only requires:
1. production_index.faiss - FAISS similarity search index
2. production_product_ids.npy - Product ID mapping
3. category_product_map.json - Category → product-ID mapping (compact)

This version does NOT require:
- TensorFlow or tensorflow-recommenders
- training_data.csv
- production_embeddings.npy
- checkpoints/best_model.h5
- production_metadata.json (replaced by category_product_map.json)
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Lazy import for FAISS
faiss = None


def _import_faiss():
    """Lazily import FAISS."""
    global faiss
    if faiss is None:
        try:
            import faiss as _faiss
            faiss = _faiss
            logger.info("FAISS loaded successfully")
        except ImportError as e:
            logger.warning(f"FAISS not available: {e}")
            raise


class ModelLoader:
    """
    Singleton class for loading and managing model components.
    
    MINIMAL DEPLOYMENT VERSION:
    - Uses pre-computed FAISS index for similarity search
    - Uses metadata for category lookup
    - Does NOT require TensorFlow at runtime
    
    Usage:
        loader = ModelLoader.get_instance()
        loader.initialize()
        similar = loader.search_similar(query_vector, k=10)
    """
    
    _instance: Optional['ModelLoader'] = None
    
    def __init__(self):
        """Initialize the model loader (use get_instance() instead)."""
        # Import config here to avoid circular imports
        from config import MODEL_PATHS, MODEL_CONFIG
        
        self.model_paths = MODEL_PATHS
        self.model_config = MODEL_CONFIG
        
        # Model components (loaded lazily)
        self._faiss_index = None
        self._product_ids: Optional[np.ndarray] = None
        self._category_map: Optional[Dict[str, List[str]]] = None
        self._product_id_to_idx: Optional[Dict[str, int]] = None
        
        # Flags
        self._initialized = False
        self._model_available = False
        
        logger.info("ModelLoader created (minimal deployment version)")
    
    @classmethod
    def get_instance(cls) -> 'ModelLoader':
        """Get the singleton instance of ModelLoader."""
        if cls._instance is None:
            cls._instance = ModelLoader()
        return cls._instance
    
    def initialize(self) -> bool:
        """
        Initialize all model components.
        
        Returns:
            True if initialization successful, False otherwise
        """
        if self._initialized:
            return self._model_available
        
        logger.info("Initializing ModelLoader...")
        
        try:
            # Step 1: Load FAISS index and product IDs
            self._load_faiss_components()
            
            # Step 2: Load category map
            self._load_category_map()
            
            self._initialized = True
            self._model_available = True
            logger.info("ModelLoader initialization complete!")
            return True
            
        except Exception as e:
            logger.error(f"ModelLoader initialization failed: {e}")
            import traceback
            traceback.print_exc()
            self._initialized = True  # Mark as initialized to avoid retry
            self._model_available = False
            return False
    
    def _load_faiss_components(self) -> None:
        """Load FAISS index and product ID mapping."""
        _import_faiss()
        
        # Load FAISS index
        faiss_path = self.model_paths["faiss_index"]
        if faiss_path.exists():
            logger.info(f"Loading FAISS index from {faiss_path}")
            self._faiss_index = faiss.read_index(str(faiss_path))
            logger.info(f"FAISS index loaded: {self._faiss_index.ntotal} vectors")
        else:
            logger.warning(f"FAISS index not found at {faiss_path}")
            # Create empty index for demo mode
            self._faiss_index = faiss.IndexFlatIP(64)  # Inner product for cosine similarity
        
        # Load product IDs
        product_ids_path = self.model_paths["product_ids"]
        if product_ids_path.exists():
            logger.info(f"Loading product IDs from {product_ids_path}")
            self._product_ids = np.load(str(product_ids_path), allow_pickle=True)
            
            # Build product ID to index mapping
            self._product_id_to_idx = {
                str(pid): idx for idx, pid in enumerate(self._product_ids)
            }
            logger.info(f"Product IDs loaded: {len(self._product_ids)} products")
        else:
            logger.warning(f"Product IDs not found at {product_ids_path}")
            self._product_ids = np.array([])
            self._product_id_to_idx = {}
    
    def _load_category_map(self) -> None:
        """Load compact category → product-IDs map."""
        # Try compact map first, fall back to legacy metadata
        map_path = self.model_paths.get("category_map")
        if map_path is None:
            from pathlib import Path
            map_path = Path(self.model_paths["faiss_index"]).parent / "category_product_map.json"

        if map_path.exists():
            logger.info(f"Loading category map from {map_path}")
            with open(map_path, 'r', encoding='utf-8') as f:
                self._category_map = json.load(f)
            total = sum(len(v) for v in self._category_map.values())
            logger.info(f"Category map loaded: {len(self._category_map)} categories, {total} products")
        else:
            # Fall back to legacy production_metadata.json
            legacy_path = self.model_paths.get("metadata")
            if legacy_path and legacy_path.exists():
                logger.info(f"Falling back to legacy metadata from {legacy_path}")
                with open(legacy_path, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                # Build category map on the fly
                from collections import defaultdict
                cat_map = defaultdict(list)
                items = []
                for pid, meta in metadata.items():
                    cat = meta.get("category", "unknown")
                    pop = meta.get("popularity", 0)
                    items.append((cat, pid, pop))
                items.sort(key=lambda x: x[2], reverse=True)
                for cat, pid, _ in items:
                    cat_map[cat].append(pid)
                self._category_map = dict(cat_map)
                total = sum(len(v) for v in self._category_map.values())
                logger.info(f"Built category map from legacy metadata: {total} products")
            else:
                logger.warning("No category map or metadata found")
                self._category_map = {}
    
    def get_embedding(self, product_id: str) -> Optional[np.ndarray]:
        """
        Get the embedding vector for a product ID from FAISS index.
        
        Args:
            product_id: Amazon product ID (e.g., "B000ZXDKCM")
            
        Returns:
            64-dimensional numpy array, or None if not found
        """
        if not self._initialized:
            self.initialize()
        
        if self._product_id_to_idx is None:
            return None
        
        idx = self._product_id_to_idx.get(str(product_id))
        if idx is None:
            logger.debug(f"Product {product_id} not found in index")
            return None
        
        # Reconstruct embedding from FAISS index
        if self._faiss_index is not None and idx < self._faiss_index.ntotal:
            try:
                embedding = self._faiss_index.reconstruct(idx)
                return embedding
            except Exception as e:
                logger.debug(f"Could not reconstruct embedding for {product_id}: {e}")
                return None
        
        return None
    
    def search_similar(
        self,
        query_vector: np.ndarray,
        k: int = 10
    ) -> List[Tuple[str, float]]:
        """
        Search for similar products using FAISS.
        
        Args:
            query_vector: 64-dimensional query vector
            k: Number of results to return
            
        Returns:
            List of (product_id, similarity_score) tuples
        """
        if not self._initialized:
            self.initialize()
        
        if self._faiss_index is None or self._faiss_index.ntotal == 0:
            logger.warning("FAISS index not available")
            return []
        
        # Ensure query vector is correct shape and normalized
        query_vector = np.array(query_vector, dtype=np.float32).reshape(1, -1)
        
        # Normalize for cosine similarity
        norm = np.linalg.norm(query_vector)
        if norm > 0:
            query_vector = query_vector / norm
        
        # Search FAISS index
        k = min(k, self._faiss_index.ntotal)
        distances, indices = self._faiss_index.search(query_vector, k)
        
        # Build results
        results = []
        for i, (dist, idx) in enumerate(zip(distances[0], indices[0])):
            if idx >= 0 and idx < len(self._product_ids):
                product_id = str(self._product_ids[idx])
                # Convert distance to similarity score (for inner product, higher is better)
                score = float(dist)
                results.append((product_id, score))
        
        return results
    
    def get_products_by_category(
        self,
        category: str,
        limit: int = 100,
        sort_by_popularity: bool = True
    ) -> List[str]:
        """
        Get product IDs for a specific category.

        The compact category map already stores IDs sorted by
        popularity (descending), so this is a simple slice.

        Args:
            category: Category name (e.g., "beauty", "fashion")
            limit: Maximum number of products to return
            sort_by_popularity: Ignored (always sorted). Kept for API compat.

        Returns:
            List of product IDs
        """
        if not self._initialized:
            self.initialize()

        if self._category_map is None:
            return []

        products = self._category_map.get(category.lower(), [])
        return products[:limit]
    
    @property
    def is_available(self) -> bool:
        """Check if model is loaded and available."""
        if not self._initialized:
            self.initialize()
        return self._model_available
    
    @property
    def num_products(self) -> int:
        """Get number of products in the index."""
        if self._faiss_index is not None:
            return self._faiss_index.ntotal
        return 0


# Singleton accessor function
def get_model_loader() -> ModelLoader:
    """
    Get the singleton ModelLoader instance.
    
    Usage:
        loader = get_model_loader()
        loader.initialize()
        embedding = loader.get_embedding("B000ZXDKCM")
    """
    return ModelLoader.get_instance()
