# Shopify AI Recommendation System

Production-ready Flask API for serving personalized product recommendations using a trained TensorFlow Two-Tower model with FAISS similarity search.

## Features

- **Personalized Recommendations**: Weighted user history (purchases 7x > views)
- **Location-Based Filtering**: Climate-appropriate recommendations (no winter items for hot regions)
- **Ethical Preferences**: Vegan, sustainable, and price range filters
- **Category Matching**: Same-category recommendations only
- **FAISS Similarity Search**: ~11ms search speed across 785K products

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Add Model Files

Place your trained model files in the `model/` directory:

```
model/
├── checkpoints/best_model.h5
├── training_data.csv
├── production_index.faiss
├── production_embeddings.npy
├── production_product_ids.npy
└── production_metadata.json
```

### 3. Run the Server

```bash
python -m api.app
```

Server starts at `http://localhost:5000`

## API Endpoints

### Health Check

```bash
GET /health
```

### Register Merchant Products

```bash
POST /api/merchant/register
Content-Type: application/json

{
  "merchant_id": "store.myshopify.com",
  "products": [
    {
      "id": "gid://shopify/Product/123",
      "title": "Organic Face Moisturizer",
      "product_type": "Beauty",
      "tags": ["skincare", "vegan", "organic"],
      "price": "29.99",
      "image": "https://cdn.shopify.com/..."
    }
  ]
}
```

### Get Recommendations

```bash
POST /api/recommend
Content-Type: application/json

{
  "merchant_id": "store.myshopify.com",
  "current_product_id": "gid://shopify/Product/123",
  "user_history": {
    "viewed": ["gid://shopify/Product/456"],
    "purchased": ["gid://shopify/Product/999"]
  },
  "user_location": "Pakistan",
  "user_preferences": {
    "vegan": true,
    "sustainable": false,
    "price_range": "medium"
  },
  "k": 10
}
```

**Response:**

```json
{
  "success": true,
  "recommendations": [
    {
      "shopify_product_id": "gid://shopify/Product/456",
      "title": "Vitamin C Serum",
      "category": "beauty",
      "price": "39.99",
      "image": "https://...",
      "tags": ["anti-aging", "vegan"],
      "score": 0.945,
      "reason": "Based on your purchase history"
    }
  ],
  "count": 10
}
```

### Get Popular Products (Cold Start)

```bash
POST /api/popular
Content-Type: application/json

{
  "merchant_id": "store.myshopify.com",
  "category": "beauty",
  "user_location": "Pakistan",
  "k": 10
}
```

## Signal Weights

Recommendations are personalized using weighted user behavior:

| Signal | Weight | Description |
|--------|--------|-------------|
| Purchases | 0.7 | Past purchases (proven preferences) |
| Current Product | 0.3 | Currently viewing |
| Recent Views | 0.1 | Casual browsing |

## Filters

### Location-Based

| Climate | Example Regions | Excluded Items |
|---------|-----------------|----------------|
| Hot | Pakistan, India, UAE | Winter, wool, snow, coat |
| Cold | Canada, UK, Russia | Beach, swimwear, summer-only |

### Ethical Preferences

- **Vegan**: Products tagged `vegan`, `cruelty-free`, `plant-based`
- **Sustainable**: Products tagged `sustainable`, `eco-friendly`, `organic`, `recycled`

### Price Ranges

| Range | Price Limit |
|-------|-------------|
| Low | $0 - $50 |
| Medium | $20 - $100 |
| High | $100+ |

## Running Tests

```bash
python -m pytest tests/ -v
```

## Project Structure

```
├── api/
│   ├── __init__.py
│   └── app.py              # Flask endpoints
├── src/
│   ├── __init__.py
│   ├── model_loader.py     # TensorFlow + FAISS loading
│   ├── recommender.py      # Core recommendation engine
│   └── filters.py          # Location, ethical, price filters
├── model/
│   ├── checkpoints/
│   ├── production_index.faiss
│   └── ...
├── tests/
│   └── test_recommendations.py
├── config.py
├── requirements.txt
└── README.md
```

## Model Architecture

The Two-Tower neural network matches the training architecture:

```
User Tower:  StringLookup → Embedding(128) → Dense(128, relu) → Dense(64)
Product Tower: StringLookup → Embedding(128) → Dense(128, relu) → Dense(64)
Category: StringLookup → Embedding(32)
Output: 64-dimensional vectors for FAISS similarity search
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| FLASK_HOST | 0.0.0.0 | Server host |
| FLASK_PORT | 5000 | Server port |
| FLASK_DEBUG | false | Debug mode |
| LOG_LEVEL | INFO | Logging level |

## License

MIT
