# Guarded Conversational Commerce

Phase 4 completes the incremental Razorpay Buildathon roadmap. It combines the authoritative catalogue, conversational checkout, and explainable recommendations with a campaign orchestrator that detects measured revenue gaps, enforces merchant policies, requires human approval, monitors performance, and triggers stop-loss automatically.

## Run locally

Requires Node.js 20 or newer. There are currently no third-party dependencies.

```bash
npm install
npm test
npm run build
npm start
```

Open <http://localhost:3000>.

For development, run `npm run dev`. Vite serves React on <http://localhost:5173> and proxies `/api` requests to the Node server on port 3000.

## API

- `GET /api/health`
- `GET /api/products?q=gift&maxPrice=2000&inStock=true`
- `GET /api/products/:id/inventory?quantity=1`
- `GET /api/audit`
- `POST /api/sessions`
- `GET /api/sessions/:id`
- `POST /api/sessions/:id/messages`
- `POST /api/sessions/:id/cart`
- `DELETE /api/sessions/:id/cart/:productId`
- `POST /api/sessions/:id/checkout`
- `POST /api/sessions/:id/payment/verify`
- `GET /api/sessions/:id/recommendations`
- `POST /api/sessions/:id/recommendations/:productId`
- `GET /api/recommendations/metrics`
- `GET /api/campaigns/opportunities`
- `GET|POST /api/campaigns`
- `GET /api/campaigns/:id`
- `POST /api/campaigns/:id/approve`
- `POST /api/campaigns/:id/launch`
- `POST /api/campaigns/:id/performance`
- `POST /api/webhooks/razorpay`

## Razorpay test mode

The app uses safe simulation when credentials are absent. To enable the actual Razorpay payment gateway:

1. Copy `.env.example` to `.env`.
2. Replace the placeholders with a Razorpay **test-mode** key ID, key secret, and webhook secret.
3. Run `npm run build && npm start`.
4. Complete a cart and approve its exact total. The React app will load Razorpay Checkout only after the server creates a real test order.

Live key IDs are rejected. The key secret never reaches React. After Checkout returns, the server verifies `razorpay_order_id|razorpay_payment_id` using HMAC-SHA256 and binds the order to its originating shopping session before marking it paid. The signed webhook at `/api/webhooks/razorpay` provides an independent, idempotent confirmation path.

For local webhook testing, expose port 3000 through a secure tunnel and configure the resulting HTTPS `/api/webhooks/razorpay` URL in the Razorpay test dashboard. Never commit `.env`.

## TDD acceptance contract

Tests verify bounded intent parsing, authoritative inventory and pricing, exact-total approval, Razorpay order creation, Checkout option isolation, payment HMAC verification, session/order binding, signed webhooks, compatible recommendations, recommendation metrics, evidence-backed campaign opportunities, policy enforcement, human approval, lifecycle transitions, hard budget caps, measured ROAS, automatic stop-loss, API readiness, and malformed-input handling.

## Current boundary

This demo deliberately uses validated synthetic funnel data and simulated campaign delivery. It never contacts real customers. Persistent storage, live consent systems, authenticated approvers, production channel providers, learned ranking, and production payment persistence are required before a real deployment.
