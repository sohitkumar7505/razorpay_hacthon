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

The app uses safe simulation when credentials are absent. Copy `.env.example` to `.env` and provide `rzp_test_...` credentials to create Razorpay test orders. Live key IDs are rejected. Configure the webhook endpoint as `/api/webhooks/razorpay` with the same webhook secret.

## TDD acceptance contract

Tests verify bounded intent parsing, authoritative inventory and pricing, exact-total approval, signed webhooks, compatible recommendations, recommendation metrics, evidence-backed campaign opportunities, policy enforcement, human approval, lifecycle transitions, hard budget caps, measured ROAS, automatic stop-loss, API readiness, and malformed-input handling.

## Current boundary

This demo deliberately uses validated synthetic funnel data and simulated campaign delivery. It never contacts real customers. Persistent storage, live consent systems, authenticated approvers, production channel providers, learned ranking, and production payment persistence are required before a real deployment.
