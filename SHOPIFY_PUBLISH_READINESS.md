# Shopify Publish Readiness (Public + Made for Shopify)

Last updated: 2026-02-24

## What is now implemented

- OAuth callback HMAC validation and OAuth `state` validation.
- Raw-body webhook HMAC verification.
- Mandatory GDPR endpoints:
  - `/webhooks/customers/data_request`
  - `/webhooks/customers/redact`
  - `/webhooks/shop/redact`
- Webhook auto-registration includes GDPR topics.
- Shopify Admin API usage migrated to GraphQL for:
  - Product sync fetches
  - Webhook subscription list/create/delete
- App proxy request signature verification on storefront endpoints:
  - `/api/recommend`
  - `/api/popular`
  - `/api/track/event`
- Access token encryption-at-rest (AES-256-GCM) via `TOKEN_ENCRYPTION_KEY`.
- Production startup guard: fails fast if `TOKEN_ENCRYPTION_KEY` is missing.
- Embedded app config aligned:
  - `embedded = true` in local and production TOML.
  - OAuth callback redirects to Shopify Admin app surface.
  - CSP `frame-ancestors` header on `/app` routes.
- Public legal/support pages:
  - `/legal/privacy`
  - `/legal/terms`
  - `/support`
- Scope/config cleanup:
  - `write_app_proxy` added to scopes.
  - webhook API version aligned to `2026-01`.

## What you must do manually in Shopify Partner Dashboard

1. Configure listing/policies
- App URL: `https://<your-production-domain>`
- Allowed redirection URL(s): `https://<your-production-domain>/auth/callback`
- Privacy policy URL: `https://<your-production-domain>/legal/privacy`
- Terms URL: `https://<your-production-domain>/legal/terms`
- Support URL: `https://<your-production-domain>/support`

2. Verify app proxy config
- Prefix: `apps`
- Subpath: `recommendations`
- Proxy URL: `https://<your-production-domain>`

3. Reinstall app after scope changes
- You added `write_app_proxy`, so reinstall is required to refresh access scopes.

4. Extension/theme checks
- In theme editor, ensure only this app’s recommendation blocks/embeds are active.
- Remove old/stale app blocks from previous app IDs.

5. Public listing package
- Add app icon, banner, screenshots/video, clear pricing, support SLA, and onboarding instructions.

6. Made for Shopify submission quality gates
- Complete accessibility review (keyboard/focus/contrast).
- Complete performance validation on slow networks and low-end devices.
- Complete support and issue response process evidence.

## Source references

- App requirements checklist:
  - https://shopify.dev/docs/apps/launch/app-requirements-checklist
- Protect customer data and mandatory compliance webhooks:
  - https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
- Made for Shopify objective standards:
  - https://shopify.dev/docs/apps/launch/badges/made-for-shopify
- App proxy signature verification reference:
  - https://shopify.dev/apps/build/online-store/app-proxies/authenticate-app-proxies
