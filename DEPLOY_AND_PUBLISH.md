# Deploy And Publish Guide (Railway-First, Lowest Cost Without Cold Starts)

This repo has two deploy targets:
- `shopify-app` (Express + Remix admin) -> Railway (recommended)
- `Flask Project` (ML API) -> Koyeb (current workflow in repo)

This guide is optimized for:
- Lowest practical monthly cost
- No sleep/cold start on the main Shopify Express app
- Clean path to Shopify production publishing

---

## 0) Cost Strategy (Recommended)

Use this setup:
1. Keep `shopify-app` on Railway with **Serverless disabled** (no cold starts)
2. Keep Flask API on Koyeb using the existing GitHub workflow
3. Use MongoDB Atlas free tier (or your current cluster)

Why: your Shopify OAuth/webhooks/admin traffic hits Express first. Keeping Express always-on protects install/auth/webhook reliability.

---

## 1) Prerequisites

Before deployment, ensure:
1. Repo is pushed to GitHub
2. You have accounts for:
   - Railway
   - Koyeb
   - MongoDB Atlas
   - Shopify Partners
3. Production secrets ready:
   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `MONGODB_URI`

---

## 2) Deploy Flask API On Koyeb (ML Service)

A workflow already exists at:
- `.github/workflows/deploy-flask-koyeb.yml`

### Steps
1. In Koyeb, create an API token.
2. In GitHub: `Settings -> Secrets and variables -> Actions`
   - Add `KOYEB_API_TOKEN`
3. Trigger deploy:
   - `Actions -> Deploy Flask API to Koyeb -> Run workflow`
4. Wait for success and copy your public Flask URL.

### Expected run command
- `gunicorn --bind 0.0.0.0:5001 api.app:app`

### Verify
- `https://<your-koyeb-domain>/health` should return healthy JSON.
- `https://<your-koyeb-domain>/health/live` should return liveness JSON.

Save this URL as:
- `FLASK_API_URL`
- `ML_API_URL` (same value)

---

## 3) Deploy Express + Remix On Railway (No Cold Starts)

### 3.1 Create Railway service
1. In Railway: `New Project -> Deploy from GitHub Repo`
2. Select this repository
3. Open the created service settings and set:
   - **Root Directory**: `/shopify-app`
   - **Build Command**: `npm ci --include=dev && npm run build:admin`
   - **Start Command**: `npm run start:render`
   - **Healthcheck Path**: `/health`
4. In `Networking`, generate a public domain.

### 3.2 Disable sleep/cold starts
1. Go to service `Settings -> Deploy -> Serverless`
2. Ensure **Serverless is OFF** (disabled)

This is the key cold-start setting on Railway.

### 3.3 Add Railway environment variables
Add these in service `Variables`:
- `NODE_ENV=production`
- `ADMIN_PORT=3001`
- `SHOPIFY_API_KEY=<your value>`
- `SHOPIFY_API_SECRET=<your value>`
- `SHOPIFY_SCOPES=read_products,write_products,read_orders`
- `SHOPIFY_HOST=https://<your-railway-domain>`
- `MONGODB_URI=<your atlas uri>`
- `FLASK_API_URL=https://<your-koyeb-domain>`
- `ML_API_URL=https://<your-koyeb-domain>`
- `ANALYTICS_API_URL=https://<your-railway-domain>`
- `NODE_API_URL=https://<your-railway-domain>`
- `RECOMMENDATION_TIMEOUT_MS=3000`
- `RECOMMENDATION_CACHE_TTL_MS=3600000`
- `SESSION_SECRET=<long-random-secret>`

### 3.4 Deploy + verify
1. Trigger deploy (or push to your tracked branch)
2. Verify:
   - `https://<your-railway-domain>/health`
   - `https://<your-railway-domain>/app` loads

---

## 4) Hard-Cap Costs (Important)

To keep monthly spend low and predictable:
1. Railway workspace -> `Usage` -> set a **Hard Limit** (example: `$6` or `$8`)
2. Service -> `Settings -> Deploy -> Resource Limits`
   - keep CPU/RAM at the lowest stable values
3. Keep one Express service only (no extra always-on replicas)
4. Keep Flask in a separate low-cost/free service as above

---

## 5) Connect Railway URL To Shopify

Update `shopify-app/shopify.app.toml`:
- `application_url = "https://<your-railway-domain>"`
- `[auth].redirect_urls = ["https://<your-railway-domain>/auth/callback"]`
- `[app_proxy].url = "https://<your-railway-domain>"`

Then update Shopify Partner Dashboard (same values):
1. `Apps -> your app -> Configuration`
2. App URL: `https://<your-railway-domain>`
3. Allowed redirection URL(s): `https://<your-railway-domain>/auth/callback`
4. Save and release

---

## 6) Production Validation Checklist

Run these checks before publishing:
1. OAuth install works:
   - `https://<your-railway-domain>/auth?shop=<your-dev-store>.myshopify.com`
2. Webhooks are registered and received
3. Product sync works (Shopify -> MongoDB -> Flask registration)
4. Recommendations endpoint returns data:
   - `GET /api/recommend?...`
5. Theme widget loads from your production app domain
6. Uninstall/reinstall flow behaves correctly
7. No 5xx errors in Railway/Koyeb logs

---

## 7) Publish Thoroughly (Shopify)

Choose one distribution path:

### A) Custom app (fastest)
1. Keep distribution as custom/private
2. Install directly on your target merchant store
3. Validate billing/support flow with real merchant data

### B) Public app (Shopify App Store)
1. In Partner Dashboard -> `Distribution`, choose Public
2. Prepare required listing assets:
   - App name, icon, screenshots, description, pricing
3. Add legal pages:
   - Privacy Policy
   - Terms of Service
   - Support contact
4. Ensure embedded admin UX and OAuth are production-safe
5. Ensure data handling + uninstall behavior meet Shopify requirements
6. Submit for Shopify review
7. Address review feedback, then publish

Official Shopify references:
- Distribution overview: https://shopify.dev/docs/apps/launch/distribution
- Distribution methods: https://shopify.dev/docs/apps/launch/distribution/select-distribution-method
- App requirements checklist: https://shopify.dev/docs/apps/launch/app-requirements-checklist

---

## 8) Rollback Plan

If production deploy breaks:
1. Roll back to previous Railway deployment
2. Repoint `SHOPIFY_HOST` only if domain changed
3. Verify `/health`, OAuth callback, and `/api/recommend`
4. Re-run Koyeb Flask workflow if ML API became unhealthy
