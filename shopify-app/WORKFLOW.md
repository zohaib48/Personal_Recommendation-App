# Shopify AI Recommendations - Development Workflow

## 🚀 Quick Start (Every Time)

### Step 1: Start All Services

Run this single command:
```bash
npm run dev:auto
```

This will:
1. ✅ Start Cloudflare Tunnel
2. ✅ Detect the tunnel URL automatically
3. ✅ Update `shopify.app.toml` with new URL
4. ✅ Update `.env` with new URL
5. ⚠️ Show you the URLs to update manually

### Step 2: Update Shopify Partner Dashboard

The script will display something like:
```
📋 IMPORTANT: Manual Step Required
════════════════════════════════════════════════════════════
Update your Shopify Partner Dashboard with these URLs:

🔗 App URL:
   https://xyz-abc.trycloudflare.com/auth

🔗 Redirect URL:
   https://xyz-abc.trycloudflare.com/auth/callback

📍 Go to: https://partners.shopify.com
   → Apps → AI Recommendations → Configuration
   → Update URLs → Save and Release
════════════════════════════════════════════════════════════
```

1. Copy the URLs shown
2. Go to [partners.shopify.com](https://partners.shopify.com)
3. Navigate to: **Apps** → **AI Recommendations** → **Configuration**
4. Paste the URLs and click **Save and Release**

### Step 3: Start the Server

After updating the dashboard, press `Ctrl+C` to stop the tunnel script, then run:
```bash
npm run server
```

Your server will start on port 3000 with:
- ✅ MongoDB connected
- ✅ Flask API connected  
- ✅ Tunnel active

### Step 4: Install/Test the App

Visit:
```
https://your-tunnel-url.trycloudflare.com/auth?shop=zohaib-dev-2.myshopify.com
```

---

## 🛠 Troubleshooting

### Port Already in Use
```bash
npx kill-port 3000
```

### MongoDB Connection Error
Check your `.env` file has the correct `MONGODB_URI`

### Flask Not Responding
Make sure Flask is running:
```bash
python -m api.app
```

### Tunnel URL Changed
Just rerun `npm run dev:auto` and follow steps 2-4 again

---

## 📚 Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev:auto` | Auto-detect tunnel URL and update configs |
| `npm run server` | Start Node.js server only |
| `npm start` | Start Node.js server (production mode) |
| `npm run auth` | Login to Shopify CLI |

---

## 🔄 Daily Workflow

1. **First terminal** - Flask API:
   ```bash
   python -m api.app
   ```

2. **Second terminal** - Get tunnel URL:
   ```bash
   cd shopify-app
   npm run dev:auto
   ```
   - Copy the displayed URLs
   - Update Partner Dashboard
   - Press Ctrl+C

3. **Third terminal** - Start server:
   ```bash
   npm run server
   ```

Done! 🎉
