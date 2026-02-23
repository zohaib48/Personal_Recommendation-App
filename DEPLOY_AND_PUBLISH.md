# Deploy And Publish Guide

This repo has two deploy targets:
- `shopify-app` (Express + Remix admin) -> Render
- `Flask Project` (ML API) -> Koyeb

## 1) Deploy Express/Shopify App On Render (Free)

`render.yaml` is already added at repo root.

### Steps
1. Push this repo to GitHub.
2. In Render, click `New +` -> `Blueprint`.
3. Select this repo and apply `render.yaml`.
4. Fill required secret env vars in Render:
   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `SHOPIFY_HOST` (your Render URL, e.g. `https://your-service.onrender.com`)
   - `MONGODB_URI` (MongoDB Atlas URI)
   - `FLASK_API_URL` (your Koyeb Flask URL)
   - `ML_API_URL` (same as `FLASK_API_URL`)
   - `ANALYTICS_API_URL` (your Render URL)
   - `NODE_API_URL` (your Render URL)
5. Deploy.

### Health check
- `https://<your-render-domain>/health`

## 2) Deploy Flask API On Koyeb (Free)

A Koyeb Git deploy workflow is added:
- `.github/workflows/deploy-flask-koyeb.yml`

### Steps
1. In Koyeb, create an API token.
2. In GitHub repo settings -> Secrets and variables -> Actions, add:
   - `KOYEB_API_TOKEN`
3. Run GitHub Action manually:
   - `Actions` -> `Deploy Flask API to Koyeb` -> `Run workflow`
4. The workflow deploys `Flask Project` using buildpacks and starts:
   - `gunicorn --bind 0.0.0.0:5001 api.app:app`

### Health check
- `https://<your-koyeb-domain>/health`

## 3) Connect Deployed URLs To Shopify App

Update `shopify-app/shopify.app.toml` production values:
- `application_url = "https://<your-render-domain>"`
- `[auth].redirect_urls = ["https://<your-render-domain>/auth/callback"]`
- `[app_proxy].url = "https://<your-render-domain>"`

Then in Shopify Partner Dashboard (App setup), set the same:
- App URL: `https://<your-render-domain>`
- Allowed redirection URL(s): `https://<your-render-domain>/auth/callback`

## 4) Publish On Shopify (Distribution Options)

You have 2 practical paths:

### A) Custom App (single merchant / client store)
- Fastest.
- No App Store listing.
- Install directly on one store.

### B) Public App (Shopify App Store listing)
- Go to Shopify Partner Dashboard -> your app -> Distribution.
- Choose `Public` distribution and prepare listing content.
- Complete required policies/pages (privacy policy, support/contact, terms).
- Ensure OAuth, data handling, uninstall behavior, and embedded admin UX are production-ready.
- Submit app for Shopify review.
- After approval, publish listing to App Store.

Official references:
- Distribution overview: https://shopify.dev/docs/apps/launch/distribution
- Public app distribution: https://shopify.dev/docs/apps/launch/distribution/select-distribution-method
- App requirements checklist: https://shopify.dev/docs/apps/launch/app-requirements-checklist

## 5) Important Free-Tier Notes

- Render free services can spin down when idle.
- Koyeb free services can scale to zero.
- Cold starts can affect Shopify webhooks/app UX.

For production reliability, keep at least the Express app on an always-on paid instance.
