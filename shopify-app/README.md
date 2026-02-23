# Shopify AI Recommendation System - Node.js Orchestrator

Complete Node.js backend for managing Shopify integration, MongoDB storage, and Flask AI engine communication.

## 🏗 Architecture

```
Shopify Store → Node.js (This App) → MongoDB (Storage) → Flask (AI Engine)
```

**Node.js responsibilities:**
- Shopify OAuth & Webhooks
- Product sync (Shopify → MongoDB → Flask)
- User interaction tracking (views, cart, purchases)
- Recommendation API (proxies to Flask)

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- MongoDB running locally or MongoDB Atlas
- Flask API running (see parent directory)

### Setup

1. **Install dependencies:**
```bash
cd shopify-app
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
- `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` from Shopify Partners
- `MONGODB_URI` - Your MongoDB connection string
- `FLASK_API_URL` - Flask API URL (default: http://localhost:5000)

3. **Start MongoDB** (if running locally):
```bash
mongod
```

4. **Start Flask API** (in separate terminal):
```bash
cd ..
python -m api.app
```

5. **Start Node.js server:**
```bash
npm run dev
```

## 🚀 Usage

### Install App to Shopify Store

1. Navigate to: `http://localhost:3000/auth?shop=your-store.myshopify.com`
2. Complete OAuth flow
3. Products will sync automatically

###  API Endpoints

#### Get Recommendations
```bash
GET /api/recommend?shop=store.myshopify.com&productId=gid://shopify/Product/123&customerId=user123&k=10
```

#### Track Product View
```bash
POST /api/track/view
{
  "shop": "store.myshopify.com",
  "customerId": "user123",
  "productId": "gid://shopify/Product/123"
}
```

#### Track Add-to-Cart
```bash
POST /api/track/cart
{
  "shop": "store.myshopify.com",
  "customerId": "user123",
  "productId": "gid://shopify/Product/123"
}
```

#### Track Purchase
```bash
POST /api/track/purchase
{
  "shop": "store.myshopify.com",
  "customerId": "user123",
  "productId": "gid://shopify/Product/123"
}
```

## 📂 Project Structure

```
shopify-app/
├── server/
│   ├── index.js              # Main server
│   ├── config/
│   │   ├── database.js       # MongoDB connection
│   │   └── shopify.js        # Shopify API config
│   ├── models/
│   │   ├── Merchant.js       # Merchant schema
│   │   ├── Product.js        # Product schema
│   │   └── UserInteraction.js# User tracking schema
│   ├── routes/
│   │   ├── auth.js           # OAuth routes
│   │   ├── webhooks.js       # Shopify webhooks
│   │   └── recommendations.js# Public API
│   ├── services/
│   │   ├── shopifyService.js # Shopify API wrapper
│   │   ├── flaskService.js   # Flask API client
│   │   └── syncService.js    # Sync orchestration
│   └── middleware/
│       └── errorHandler.js   # Global error handling
├── package.json
└── .env.example
```

## 🔄 Data Flow

1. **Installation:** Merchant installs app → OAuth → Save to MongoDB → Sync products to Flask
2. **Webhooks:** Product created/updated → MongoDB → Flask
3. **Recommendations:** Frontend requests → Node.js → Get user history from MongoDB → Flask → Return to frontend
4. **Tracking:** User views/carts/purchases → Save to MongoDB → Used for next recommendation

## 🛠 Development

### Run in watch mode:
```bash
npm run dev
```

### Production:
```bash
npm start
```

## ⏰ Scheduled Tasks

- **Daily at 2 AM:** Full product resync for all merchants

## 🔐 Security Notes

TODO before production:
- [ ] Add HMAC verification for webhooks
- [ ] Encrypt access tokens in database
- [ ] Add rate limiting
- [ ] Add request validation
- [ ] Use HTTPS only

## 📝 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SHOPIFY_API_KEY` | Shopify Partners API key | `abc123...` |
| `SHOPIFY_API_SECRET` | Shopify Partners API secret | `xyz789...` |
| `SHOPIFY_SCOPES` | OAuth scopes | `read_products,write_products` |
| `SHOPIFY_HOST` | Your app's public URL | `https://app.ngrok.io` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/...` |
| `FLASK_API_URL` | Flask API endpoint | `http://localhost:5000` |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` or `production` |

## 🤝 Integration with Flask

Node.js calls Flask API for:
- `/api/merchant/register` - Register products
- `/api/recommend` - Get recommendations
- `/api/merchant/<id>` DELETE - Remove merchant

Flask holds products in-memory for fast recommendations. Node.js ensures Flask stays in sync with MongoDB.

## Admin Dashboard (Remix)

The merchant admin UI is implemented under `app/` using Remix and Shopify Polaris.

Key routes:
- `app/routes/app._index.jsx` - Overview
- `app/routes/app.settings.jsx` - Settings
- `app/routes/app.analytics.jsx` - Analytics
- `app/routes/app.products.jsx` - Products
- `app/routes/app.customers.jsx` - Customers (Pro)
- `app/routes/app.onboarding.jsx` - Onboarding

Run the admin UI (local dev):
- `npm run dev:admin`
- `npm run build:admin`
- `npm run start:admin`

Environment variables used by the admin UI:
- `ML_API_URL` (defaults to `FLASK_API_URL`)
- `ANALYTICS_API_URL` or `NODE_API_URL` (defaults to `http://localhost:3000`)

## Theme App Extension (Customer Widgets)

Widgets are built as a theme app extension under:
`extensions/recommendation-widget/`

Blocks:
- `blocks/product-recommendations.liquid`
- `blocks/cart-recommendations.liquid`
- `blocks/homepage-recommendations.liquid`
- `blocks/cart-drawer-recommendations-embed.liquid` (app embed)

Assets:
- `assets/widget.js` (vanilla JS)
- `assets/widget.css`

Email template:
- `docs/email-widget.html`

### Widget Installation (Theme App Extension)
1. Shopify Admin > Online Store > Themes > Customize
2. Add an app block:
   - AI Recommendations - Product
   - AI Recommendations - Cart
   - AI Recommendations - Homepage
3. If your theme uses a cart drawer, open **App embeds** and enable:
   - **AI Recs Cart Drawer**
4. Set the API base URL to your app domain (for example `https://your-app-domain.com`).

### Embed Code (Fallback)
```html
<div
  data-ai-recommendations
  data-merchant="shop.myshopify.com"
  data-product-id="{{ product.id }}"
  data-location="product_page"
  data-title="You Might Also Like"
  data-limit="4"
  data-api-base="https://your-app-domain.com">
</div>
<script src="https://your-app-domain.com/widget.js" async></script>
```

## Analytics Tracking

Widget events are sent to `/api/track/event`:
- `recommendation_shown`
- `recommendation_clicked`
- `recommendation_added_to_cart`
- `recommendation_purchased` (capture via order status page or post-purchase flow)

Example payload:
```
{
  "event_type": "recommendation_clicked",
  "merchant_id": "shop.myshopify.com",
  "recommendation_id": "gid://shopify/Product/123",
  "position": 2,
  "timestamp": "2024-02-09T12:01:00Z"
}
```

## Troubleshooting

- Widget does not render:
  - Verify `data-api-base` matches your app domain.
  - Check `/health` on the app server.
  - Ensure the block is placed on a compatible template.

- No recommendations returned:
  - The widget falls back to `/api/popular` automatically.
  - If the store has fewer than 10 products, consider adding more products for better results.

- API timeouts:
  - Default timeout is 3 seconds. Increase `RECOMMENDATION_TIMEOUT_MS` if needed.

## Testing

Unit tests and integration tests:
- `npm run test`

E2E tests (requires `E2E_BASE_URL`):
- `npm run test:e2e`

Visual regression tests for widgets:
- `npm run test:visual`
