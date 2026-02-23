"""
ML-Based Category Classifier for Shopify Products.

Uses TF-IDF + LinearSVC to classify products into categories
based on their title, product_type, and tags.

Trained from CATEGORY_KEYWORDS in config.py — no external training data needed.
Generalises better than exact keyword matching because TF-IDF captures
character n-gram patterns and LinearSVC finds optimal decision boundaries.

Model size: ~50 KB (pickle).  Inference: < 1 ms.  Zero deployment cost.
"""

import logging
import pickle
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.pipeline import Pipeline

from config import CATEGORY_KEYWORDS

logger = logging.getLogger(__name__)

# Default path to persist the trained model
_DEFAULT_MODEL_PATH = Path(__file__).parent.parent / "model" / "category_classifier.pkl"


class CategoryClassifier:
    """
    Lightweight product category classifier.

    Training strategy (weak supervision):
        We generate synthetic training examples from the CATEGORY_KEYWORDS
        config.  Each keyword or short phrase becomes a training document
        labelled with its category.  We also create composite examples by
        combining 2-3 keywords so the model sees realistic multi-word inputs.

    Architecture:
        TF-IDF (char + word n-grams) → CalibratedClassifierCV(LinearSVC)

        CalibratedClassifierCV wraps LinearSVC to produce probability
        estimates (confidence scores) via Platt scaling.

    Usage:
        clf = CategoryClassifier()
        clf.train()                     # trains from CATEGORY_KEYWORDS
        cat, conf = clf.predict("Organic Face Moisturizer", "Beauty", ["skincare"])
        clf.save()                      # optional persistence
    """

    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or _DEFAULT_MODEL_PATH
        self._pipeline: Optional[Pipeline] = None
        self._categories: List[str] = []
        self._is_trained = False

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    def train(self, keywords_map: Optional[Dict[str, List[str]]] = None) -> None:
        """
        Train the classifier from a category-keywords mapping.

        Args:
            keywords_map: ``{category: [keyword, ...]}`` — defaults to
                ``CATEGORY_KEYWORDS`` from config.
        """
        keywords_map = keywords_map or CATEGORY_KEYWORDS
        texts, labels = self._build_training_data(keywords_map)

        logger.info(
            "Training category classifier on %d examples across %d categories",
            len(texts),
            len(set(labels)),
        )

        # TF-IDF with both word and character n-grams for robustness
        tfidf = TfidfVectorizer(
            analyzer="char_wb",   # character n-grams at word boundaries
            ngram_range=(2, 5),   # 2-char to 5-char grams
            max_features=8000,
            sublinear_tf=True,
        )

        svc = LinearSVC(
            C=1.0,
            max_iter=5000,
            class_weight="balanced",
        )

        # Wrap with CalibratedClassifierCV for probability estimates
        calibrated = CalibratedClassifierCV(svc, cv=3, method="sigmoid")

        self._pipeline = Pipeline([
            ("tfidf", tfidf),
            ("clf", calibrated),
        ])

        self._pipeline.fit(texts, labels)
        self._categories = sorted(set(labels))
        self._is_trained = True

        logger.info("Category classifier trained successfully")

    def _build_training_data(
        self, keywords_map: Dict[str, List[str]]
    ) -> Tuple[List[str], List[str]]:
        """
        Generate synthetic training examples from keyword lists.

        For each category we produce:
        1. Individual keywords (e.g. "skincare")
        2. Pairs of keywords    (e.g. "moisturizer serum")
        3. Triples              (e.g. "organic face cream skincare")
        4. Keywords prefixed with realistic product-title patterns
           (e.g. "Premium skincare", "Deluxe moisturizer set")
        """
        import random
        random.seed(42)

        texts: List[str] = []
        labels: List[str] = []

        title_prefixes = [
            "", "Premium", "Deluxe", "Pro", "Ultra", "Natural", "Organic",
            "Classic", "Modern", "Luxury", "Essential", "Original",
            "Advanced", "Professional", "Best Selling",
        ]
        title_suffixes = [
            "", "Set", "Kit", "Collection", "Bundle", "Pack",
            "for Women", "for Men", "for Home", "for Kids",
        ]

        for category, keywords in keywords_map.items():
            # 1 — individual keywords
            for kw in keywords:
                texts.append(kw)
                labels.append(category)

            # 2 — pairs
            for _ in range(min(len(keywords) * 3, 200)):
                pair = random.sample(keywords, min(2, len(keywords)))
                texts.append(" ".join(pair))
                labels.append(category)

            # 3 — triples
            for _ in range(min(len(keywords) * 2, 150)):
                triple = random.sample(keywords, min(3, len(keywords)))
                texts.append(" ".join(triple))
                labels.append(category)

            # 4 — prefix/suffix patterns
            for kw in keywords:
                prefix = random.choice(title_prefixes)
                suffix = random.choice(title_suffixes)
                text = f"{prefix} {kw} {suffix}".strip()
                texts.append(text)
                labels.append(category)

        logger.debug("Built %d training examples", len(texts))
        return texts, labels

    # ------------------------------------------------------------------
    # Prediction
    # ------------------------------------------------------------------

    def predict(
        self,
        title: str = "",
        product_type: str = "",
        tags: Optional[List[str]] = None,
    ) -> Tuple[str, float]:
        """
        Predict the category for a product.

        Args:
            title: Product title
            product_type: Shopify product type
            tags: List of tags (or comma-separated string)

        Returns:
            ``(category, confidence)`` where confidence is 0.0–1.0
        """
        if not self._is_trained:
            self._ensure_loaded()

        if not self._is_trained:
            raise RuntimeError("Classifier not trained — call train() or load()")

        text = self._combine_text(title, product_type, tags)

        if not text.strip():
            return "home", 0.0  # fallback for empty input

        probs = self._pipeline.predict_proba([text])[0]
        idx = int(np.argmax(probs))
        category = self._pipeline.classes_[idx]
        confidence = float(probs[idx])

        return category, confidence

    @staticmethod
    def _combine_text(
        title: str = "",
        product_type: str = "",
        tags: Optional[List[str]] = None,
    ) -> str:
        """Combine product fields into a single text for classification."""
        parts = [str(title).lower(), str(product_type).lower()]

        if tags:
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",")]
            parts.extend(str(t).lower() for t in tags)

        return " ".join(parts)

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, path: Optional[Path] = None) -> None:
        """Save trained model to disk."""
        path = path or self.model_path
        path.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "pipeline": self._pipeline,
            "categories": self._categories,
        }
        with open(path, "wb") as f:
            pickle.dump(data, f)

        size_kb = path.stat().st_size / 1024
        logger.info("Classifier saved to %s (%.1f KB)", path, size_kb)

    def load(self, path: Optional[Path] = None) -> bool:
        """Load trained model from disk.  Returns True on success."""
        path = path or self.model_path

        if not path.exists():
            logger.warning("Classifier model not found at %s", path)
            return False

        try:
            with open(path, "rb") as f:
                data = pickle.load(f)
            self._pipeline = data["pipeline"]
            self._categories = data["categories"]
            self._is_trained = True
            logger.info("Classifier loaded from %s", path)
            return True
        except Exception as e:
            logger.error("Failed to load classifier: %s", e)
            return False

    def _ensure_loaded(self) -> None:
        """Try to load a persisted model if not already trained."""
        if not self._is_trained:
            if self.model_path.exists():
                self.load()


# ======================================================================
# Singleton
# ======================================================================

_instance: Optional[CategoryClassifier] = None


def get_category_classifier() -> CategoryClassifier:
    """
    Get the singleton CategoryClassifier, training it if needed.

    On first call the classifier will:
    1. Try to load from ``model/category_classifier.pkl``
    2. If not found, train from ``CATEGORY_KEYWORDS`` and save
    """
    global _instance
    if _instance is None:
        _instance = CategoryClassifier()
        if not _instance.load():
            logger.info("No saved classifier found — training fresh")
            _instance.train()
            _instance.save()
    return _instance
