# Agentic Merchant Catalogue

Phase 1 of an incremental Razorpay Buildathon project. This release provides an authoritative, searchable merchant catalogue with inventory checks and a reconstructable audit trail.

## Run locally

Requires Node.js 20 or newer. There are currently no third-party dependencies.

```bash
npm test
npm start
```

Open <http://localhost:3000>.

## API

- `GET /api/health`
- `GET /api/products?q=gift&maxPrice=2000&inStock=true`
- `GET /api/products/:id/inventory?quantity=1`
- `GET /api/audit`

## TDD acceptance contract

The automated tests verify product validation, duplicate rejection, bounded search, authoritative inventory, audit events, API readiness, API filtering, and invalid-input handling.

## Current boundary

This version deliberately uses validated seed data and an in-memory store. CSV/PDF ingestion, persistent PostgreSQL storage, agent tool adapters, authentication, and Razorpay checkout belong to later incremental releases.
