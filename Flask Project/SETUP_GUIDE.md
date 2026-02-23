# Shopify AI Recommendation System - Complete Setup Guide

This guide will help you set up and run the complete system: Node.js orchestrator + Flask AI engine + MongoDB.

## 📋 Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Python** 3.8+ ([Download](https://www.python.org/))
- **MongoDB** ([Download](https://www.mongodb.com/try/download/community) or use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas))
- **Shopify Partner Account** ([Sign up](https://partners.shopify.com/))
- **Development Store** (Create from Shopify Partners dashboard)

## 🚀 Quick Start

### Step 1: Clone and Setup

```bash
cd "c:\Users\zohaib shafique\Documents\Shopify-Recommeder_System"
```

### Step 2: Setup MongoDB

**Option A: Local MongoDB**
```bash
# Start MongoDB service
mongod
```

**Option B: MongoDB Atlas**
1. Create free cluster at [mongodb.com/atlas](https://www.mongodb.com/cloud/atlas)
2. Get connection string
3. Whitelist your IP

### Step 3: Setup Flask API

```bash
# Install Python dependencies
pip install -r requirements.txt

# Start Flask server
python -m api.app
```

Flask should start on `http://localhost:5000`

### Step 4: Setup Node.js Orchestrator

```bash
# Navigate to Node.js app
cd shopify-app

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

**Edit `.env` file:**

```env
# Get these from Shopify Partners > Apps > Create App
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_SCOPES=read_products,write_products,read_orders
SHOPIFY_HOST=https://your-ngrok-url.ngrok.io

# MongoDB
MONGODB_URI=mongodb://localhost:27017/shopify-recommendations

# Flask
FLASK_API_URL=http://localhost:5000

# Server
PORT=3000
NODE_ENV=development
SESSION_SECRET=generate_random_string_here
```

```bash
# Start Node.js server
npm run dev
```

### Step 5: Expose with ngrok (for Shopify webhooks)

```bash
# Install ngrok: https://ngrok.com/download

# Expose port 3000
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and update:
1. `.env` file → `SHOPIFY_HOST`
2. Shopify Partners → App setup → URLs

### Step 6: Create Shopify App

1. Go to [Shopify Partners](https://partners.shopify.com/)
2. **Apps** → **Create app** → **Custom app**
3. **App setup:**
   - App URL: `https://your-ngrok-url.ngrok.io/auth`
   - Allowed redirection URLs: `https://your-ngrok-url.ngrok.io/auth/callback`
4. **API scopes:** Select `read_products`, `write_products`
5. Save and copy API credentials to `.env`

### Step 7: Configure Webhooks

In Shopify Partners → Your App → Webhooks:

| Event | URL |
|-------|-----|
| `products/create` | `https://your-ngrok-url.ngrok.io/webhooks/products/create` |
| `products/update` | `https://your-ngrok-url.ngrok.io/webhooks/products/update` |
| `products/delete` | `https://your-ngrok-url.ngrok.io/webhooks/products/delete` |
| `app/uninstalled` | `https://your-ngrok-url.ngrok.io/webhooks/app/uninstalled` |

### Step 8: Install App to Development Store

```
https://your-ngrok-url.ngrok.io/auth?shop=your-dev-store.myshopify.com
```

Complete OAuth flow. Products will sync automatically!

## 🧪 Testing

### Health Checks

```bash
# Node.js
curl http://localhost:3000/health

# Flask
curl http://localhost:5000/health
```

### Get Recommendations

```bash
curl "http://localhost:3000/api/recommend?shop=your-store.myshopify.com&productId=gid://shopify/Product/123&k=5"
```

### Track User Events

```bash
# View
curl -X POST http://localhost:3000/api/track/view \
  -H "Content-Type: application/json" \
  -d '{"shop":"your-store.myshopify.com","customerId":"user123","productId":"gid://shopify/Product/123"}'

# Add to cart
curl -X POST http://localhost:3000/api/track/cart \
  -H "Content-Type: application/json" \
  -d '{"shop":"your-store.myshopify.com","customerId":"user123","productId":"gid://shopify/Product/456"}'

# Purchase
curl -X POST http://localhost:3000/api/track/purchase \
  -H "Content-Type: application/json" \
  -d '{"shop":"your-store.myshopify.com","customerId":"user123","productId":"gid://shopify/Product/789"}'
```

## 📊 System Architecture

```
┌─────────────────┐
│  Shopify Store  │
└────────┬────────┘
         │ OAuth & Webhooks
         ▼
┌─────────────────┐
│   Node.js API   │ ◄─── Frontend calls for recommendations
│  (Port 3000)    │
└────────┬────────┘
         │
         ├─────────► MongoDB (Permanent storage)
         │
         └─────────► Flask API (AI recommendations)
                     (Port 5000)
```

## 🔑 Signal Weights (Recommendation Algorithm)

- **Purchases:** 0.7 (Strongest - They bought it!)
- **Cart:** 0.5 (High intent - About to buy)
- **Current Product:** 0.3 (Viewing now)
- **Views:** 0.1 (Casual browsing)

## 🛠 Troubleshooting

### MongoDB Connection Error
```bash
# Check if MongoDB is running
mongo --eval "db.runCommand({ connectionStatus: 1 })"
```

### Flask Not Found
```bash
# Make sure Flask is running on port 5000
netstat -an | findstr "5000"
```

### Webhooks Not Working
1. Verify ngrok is running
2. Check webhook URLs in Shopify Partners
3. Check ngrok console for incoming requests

### No Recommendations
1. Ensure products are registered (check MongoDB)
2. Verify Flask has products loaded:
   ```bash
   curl http://localhost:5000/api/merchant/your-store.myshopify.com/products
   ```

## 📝 Next Steps

- [ ] Add Redis caching layer
- [ ] Implement frontend Shopify theme extension
- [ ] Add analytics dashboard
- [ ] Deploy to production (Heroku/AWS/DigitalOcean)

## 🤝 Support

For issues, check:
1. Node.js console logs
2. Flask console logs
3. MongoDB logs
4. ngrok request inspector: `http://localhost:4040`
