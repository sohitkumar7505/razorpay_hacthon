# Agentic Merchant Catalogue

Phase 1 of an incremental Razorpay Buildathon project. This release provides an authoritative, searchable merchant catalogue with inventory checks and a reconstructable audit trail. The frontend uses React and Tailwind CSS; the API runs on Node.js.

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

## TDD acceptance contract

The automated tests verify product validation, duplicate rejection, bounded search, authoritative inventory, audit events, API readiness, API filtering, and invalid-input handling.

## Current boundary

This version deliberately uses validated seed data and an in-memory store. CSV/PDF ingestion, persistent PostgreSQL storage, agent tool adapters, authentication, and Razorpay checkout belong to later incremental releases.
