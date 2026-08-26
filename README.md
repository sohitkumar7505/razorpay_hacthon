# Guarded Conversational Commerce

Phase 2 of an incremental Razorpay Buildathon project. It retains the authoritative catalogue and adds conversational product discovery, a guarded cart, exact-total checkout approval, Razorpay test-order support, signed webhooks, and a commerce audit trail.

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
- `POST /api/webhooks/razorpay`

## Razorpay test mode

The app uses safe simulation when credentials are absent. Copy `.env.example` to `.env` and provide `rzp_test_...` credentials to create Razorpay test orders. Live key IDs are rejected. Configure the webhook endpoint as `/api/webhooks/razorpay` with the same webhook secret.

## TDD acceptance contract

Tests verify bounded intent parsing, authoritative inventory and pricing, spending-limit enforcement, exact-total approval, idempotent orders, signed webhooks, duplicate webhook safety, API readiness, and malformed-input handling.

## Current boundary

This version deliberately uses validated seed data, deterministic intent parsing, and an in-memory session store. Persistent storage, LLM tool adapters, authentication, and production payment persistence belong to later releases.
