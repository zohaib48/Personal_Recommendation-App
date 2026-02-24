# App Bridge + Session Token Migration Checklist

Last updated: 2026-02-24

## Implemented in code

1. `app/root.jsx`
- Added Shopify App Bridge bootstrap script (`app-bridge.js`).
- Added `<meta name="shopify-api-key" ...>` from Remix loader.
- Preserves `host` and `shop` query params in internal admin navigation links.

2. `app/lib/session-token.client.js`
- Added helper to request App Bridge session token via `window.shopify.idToken()`.
- Added helper to inject `Authorization: Bearer <token>` header.

3. `app/routes/app.settings.jsx`
- Settings save request now sends session token header when available.

4. `server/middleware/adminSessionAuth.js`
- Added middleware to decode Shopify session token with `@shopify/shopify-api`.
- Extracts authenticated shop from token `dest`.
- Supports strict mode via `ENFORCE_ADMIN_SESSION_TOKEN=true`.

5. `server/routes/settings.js`
- Applied admin session middleware to `/api/settings` and `/api/dashboard`.
- Shop resolution now prefers authenticated token shop over request input.

## Pending before strict enforcement

1. Rollout phase
- Keep `ENFORCE_ADMIN_SESSION_TOKEN=false` for initial deploy.
- Confirm dashboard/settings still function in embedded admin.

2. Verify token flow in production
- In browser devtools (Shopify admin iframe), confirm `/api/settings` includes `Authorization: Bearer ...`.
- Confirm backend accepts token and resolves shop correctly.

3. Enable strict mode
- Set `ENFORCE_ADMIN_SESSION_TOKEN=true` in production env.
- Re-test settings save, dashboard load, and app navigation.

4. Extend protection to additional admin endpoints
- If more admin-only endpoints are added later, apply `authenticateAdminSession`.

## Review evidence to prepare

1. Screenshot/video
- Embedded app loaded in Shopify admin.
- Settings save successful with token-authenticated request.

2. Security notes
- Session token validated server-side.
- Merchant access tokens encrypted at rest (`TOKEN_ENCRYPTION_KEY`).

3. Operational notes
- Keep app proxy paths unique per environment:
  - production: `/apps/recommendations-prod`
  - local: `/apps/recommendations-local`
