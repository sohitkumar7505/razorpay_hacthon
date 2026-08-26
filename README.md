# Guarded Agentic Commerce

An AI storefront and merchant growth platform built for the Razorpay Buildathon. Customers can talk to a shopkeeper-style agent, discover verified products, manage a guarded cart, receive explainable recommendations, and complete a Razorpay test payment. Merchants can manage their catalogue, configure agent limits, inspect LangGraph execution, and operate bounded campaigns.

## What is implemented

### Customer storefront

- Multi-turn shopping chat that remembers category, product type, use case, and budget.
- Verified product search using authoritative prices, inventory, shipping time, and return eligibility.
- Natural cart commands such as `Add this cream to cart`, `Add the first product`, `Make quantity 2`, `Remove the item`, and `Show me something cheaper`.
- Clarification instead of unsafe cart changes when a product reference is ambiguous.
- Product cards with price, tags, inventory, shipping time, and cart controls.
- Guarded cart with quantity controls, spending-limit enforcement, and verified totals.
- Explainable recommendations based on the cart and purchase history.
- Persistent customer identity, chat, preferences, cart, checkout, and order history.
- Razorpay test checkout with server-side signature verification.
- Payment confirmation, inventory reduction, purchase-history updates, and duplicate-event protection.
- Visible agent activity and remembered-preference indicators.

### Merchant console

- Live LangGraph runs with node-level status and redacted execution details.
- Authoritative product list with prices and inventory.
- Clearly labelled add/edit product form with descriptions and examples.
- Product creation, editing, deletion, and inventory updates.
- CSV catalogue import with per-row validation errors.
- Persistent settings for maximum spending, discount limits, approval thresholds, prohibited products, shipping policy, and return policy.
- Revenue-opportunity detection and bounded campaign proposals.
- Human approval, budget enforcement, ROAS measurement, and automatic stop-loss.

### Persistence and infrastructure

- PostgreSQL 16 through Docker Compose.
- Persistent storage for customers, sessions, products, carts, orders, and merchant settings.
- Session restoration after backend restarts.
- React 19 and Tailwind CSS frontend.
- Node.js backend and LangGraph workflows.
- Razorpay test-mode integration and optional OpenAI response generation.

## LangGraph architecture

```text
Shopping
intent-agent → preference-agent → catalogue-agent → ranking-agent
→ clarification-agent → guardrail-agent → response-agent

Recommendations
cart-context-agent → recommendation-agent → revenue-guard-agent

Checkout
cart-agent → risk-agent → payment-agent → audit-agent

Campaigns
opportunity-agent → campaign-agent → compliance-agent → campaign-audit-agent
```

Prices, inventory, totals, guardrails, payment creation, and signature verification are deterministic. When `OPENAI_API_KEY` is configured, the model can improve only the final response after catalogue tools return verified products. LLM failures fall back to the deterministic response.

## Requirements

- Node.js 20 or newer
- npm
- Docker Desktop or another Docker Compose-compatible runtime
- Razorpay test credentials for gateway checkout
- OpenAI API key only for optional LLM responses

## Environment configuration

```bash
cp .env.example .env
```

Configure `.env`:

```env
PORT=3000
DATABASE_URL=postgresql://commerce:commerce_dev@localhost:5432/agentic_commerce

PAYMENT_MODE=razorpay
RAZORPAY_KEY_ID=rzp_test_replace_me
RAZORPAY_KEY_SECRET=replace_me
RAZORPAY_WEBHOOK_SECRET=replace_me

OPENAI_API_KEY=
LLM_MODEL=gpt-4o-mini
```

Use only Razorpay test keys. Live key IDs are rejected, and `.env` must never be committed.

## Run the application

```bash
npm install
npm run db:up
npm test
npm run build
npm start
```

Open:

- Customer storefront: <http://localhost:3000/customer>
- Merchant console: <http://localhost:3000/merchant>

Development mode:

```bash
npm run dev
```

Vite runs at <http://localhost:5173> and proxies `/api` to port 3000.

Stop PostgreSQL without deleting its volume:

```bash
npm run db:down
```

## Razorpay payment lifecycle

1. The customer approves the exact verified total.
2. The backend creates a Razorpay test order.
3. React opens Razorpay Checkout.
4. Razorpay returns payment, order, and signature fields.
5. The backend verifies the HMAC signature and session ownership.
6. The order is marked paid exactly once.
7. Inventory is reduced, history is updated, and the cart is cleared.
8. A signed webhook can confirm the payment without duplicating it.

For webhook testing, expose port 3000 through HTTPS and register:

```text
https://your-domain.example/api/webhooks/razorpay
```

## Important API routes

### Customers and sessions

- `GET|POST /api/customers`
- `GET /api/customers/:id/orders`
- `POST /api/sessions`
- `GET /api/sessions/:id`
- `POST /api/sessions/:id/messages`
- `POST /api/sessions/:id/cart`
- `DELETE /api/sessions/:id/cart/:productId`

### Catalogue and recommendations

- `GET|POST /api/products`
- `PUT|DELETE /api/products/:id`
- `POST /api/products/import`
- `GET /api/products/:id/inventory`
- `GET /api/sessions/:id/recommendations`
- `POST /api/sessions/:id/recommendations/:productId`

### Payments

- `POST /api/sessions/:id/checkout`
- `POST /api/sessions/:id/payment/verify`
- `POST /api/webhooks/razorpay`

### Merchant and agents

- `GET|PUT /api/merchant/settings`
- `GET /api/agents/status`
- `GET /api/agents/runs`
- `GET /api/campaigns/opportunities`
- `GET|POST /api/campaigns`
- `POST /api/campaigns/:id/approve`
- `POST /api/campaigns/:id/launch`
- `POST /api/campaigns/:id/performance`
- `GET /api/audit`

## Testing

The suite covers conversational memory, cart commands, ambiguity handling, authoritative price and inventory checks, spending limits, recommendations, checkout approval, Razorpay HMAC verification, session/order binding, idempotent payments, LangGraph execution, campaign policies, ROAS, stop-loss, and API validation.

```bash
npm test
```

## Current production boundaries

This is a test-mode Buildathon application. Production deployment still needs authenticated accounts, role-based authorization, encrypted secret management, database migrations, monitoring, rate limiting, consent management, real campaign providers, image storage, PDF catalogue extraction, and deployment infrastructure. Campaign delivery remains simulated and Razorpay live keys are intentionally rejected.
