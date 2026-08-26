import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createApp } from "../src/server.js";

async function withServer(run, options = {}) {
  const server = createApp({ agentEnv: {}, ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function post(baseUrl, path, body, headers = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

test("health endpoint reports readiness", () => withServer(async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "catalogue", payments: "simulated" });
}));

test("catalogue endpoint supports bounded product search", () => withServer(async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/products?q=skincare&maxPrice=1000&inStock=true`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.count >= 1);
  assert.ok(body.products.every((product) => product.price <= 1000 && product.inventory > 0));
}));

test("inventory endpoint rejects invalid quantities", () => withServer(async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/products/serum-01/inventory?quantity=0`);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /quantity/i);
}));

test("shopping session supports conversation, cart and approved checkout", () => withServer(async (baseUrl) => {
  const created = await post(baseUrl, "/api/sessions", { spendingLimit: 2000 });
  assert.equal(created.status, 201);
  const session = await created.json();

  const reply = await post(baseUrl, `/api/sessions/${session.id}/messages`, {
    message: "I need a skincare gift under ₹1,000"
  });
  assert.equal(reply.status, 200);
  assert.equal((await reply.json()).suggestions[0].id, "serum-01");

  const cart = await post(baseUrl, `/api/sessions/${session.id}/cart`, { productId: "serum-01", quantity: 1 });
  assert.equal(cart.status, 200);
  assert.equal((await cart.json()).total, 799);

  const checkout = await post(baseUrl, `/api/sessions/${session.id}/checkout`, { approvedTotal: 799 });
  assert.equal(checkout.status, 201);
  assert.equal((await checkout.json()).paymentOrder.amount, 79900);
}));

test("API rejects malformed JSON and unknown sessions safely", () => withServer(async (baseUrl) => {
  const malformed = await fetch(`${baseUrl}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{"
  });
  assert.equal(malformed.status, 400);

  const missing = await post(baseUrl, "/api/sessions/missing/cart", { productId: "serum-01", quantity: 1 });
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /session/i);
}));

test("recommendation API explains an add-on and tracks acceptance", () => withServer(async (baseUrl) => {
  const session = await (await post(baseUrl, "/api/sessions", { spendingLimit: 2000 })).json();
  await post(baseUrl, `/api/sessions/${session.id}/cart`, { productId: "serum-01", quantity: 1 });
  const response = await fetch(`${baseUrl}/api/sessions/${session.id}/recommendations`);
  assert.equal(response.status, 200);
  const recommendations = (await response.json()).recommendations;
  assert.equal(recommendations[0].product.id, "gift-wrap-01");

  const accepted = await post(baseUrl, `/api/sessions/${session.id}/recommendations/gift-wrap-01`, { decision: "accepted" });
  assert.equal(accepted.status, 200);
  const result = await accepted.json();
  assert.equal(result.cart.total, 998);
  assert.equal(result.metrics.incrementalRevenue, 199);
}));

test("campaign API enforces proposal, approval, launch and stop-loss lifecycle", () => withServer(async (baseUrl) => {
  const opportunities = await (await fetch(`${baseUrl}/api/campaigns/opportunities`)).json();
  assert.equal(opportunities.opportunities[0].product.id, "cream-01");

  const proposed = await post(baseUrl, "/api/campaigns", {
    productId: "cream-01", budget: 1500, discountPercent: 10,
    audience: "consented_cart_abandoners", channel: "email", maxMessagesPerCustomer: 1
  });
  assert.equal(proposed.status, 201);
  const campaign = await proposed.json();

  const premature = await post(baseUrl, `/api/campaigns/${campaign.id}/launch`, {});
  assert.equal(premature.status, 400);

  assert.equal((await post(baseUrl, `/api/campaigns/${campaign.id}/approve`, { approvedBy: "merchant-demo" })).status, 200);
  assert.equal((await post(baseUrl, `/api/campaigns/${campaign.id}/launch`, {})).status, 200);
  const performance = await post(baseUrl, `/api/campaigns/${campaign.id}/performance`, {
    spend: 600, impressions: 1000, clicks: 10, conversions: 0, revenue: 0
  });
  assert.equal(performance.status, 200);
  assert.equal((await performance.json()).status, "paused_stop_loss");
}));

test("verifies Razorpay Checkout signature before marking the bound session paid", () => withServer(async (baseUrl) => {
  const session = await (await post(baseUrl, "/api/sessions", { spendingLimit: 2000 })).json();
  await post(baseUrl, `/api/sessions/${session.id}/cart`, { productId: "serum-01", quantity: 1 });
  const checkout = await (await post(baseUrl, `/api/sessions/${session.id}/checkout`, { approvedTotal: 799 })).json();
  const orderId = checkout.paymentOrder.id;
  const paymentId = "pay_test_456";
  const signature = createHmac("sha256", "test_key_secret").update(`${orderId}|${paymentId}`).digest("hex");

  const invalid = await post(baseUrl, `/api/sessions/${session.id}/payment/verify`, {
    razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: "0".repeat(64)
  });
  assert.equal(invalid.status, 401);

  const verified = await post(baseUrl, `/api/sessions/${session.id}/payment/verify`, {
    razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature
  });
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).status, "paid");
}, {
  payments: {
    mode: "razorpay_test",
    async createOrder(order) {
      return { id: "order_test_gateway", ...order, status: "created", simulated: false, keyId: "rzp_test_public" };
    }
  },
  paymentVerificationSecret: "test_key_secret"
}));

test("exposes completed LangGraph agent runs after a shopping task", () => withServer(async (baseUrl) => {
  const session = await (await post(baseUrl, "/api/sessions", { spendingLimit: 2000 })).json();
  await post(baseUrl, `/api/sessions/${session.id}/messages`, { message: "I need a skincare gift under ₹1,000" });
  const response = await fetch(`${baseUrl}/api/agents/runs`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.runs[0].workflow, "shopping");
  assert.equal(body.runs[0].status, "completed");
  assert.ok(body.runs[0].events.some(({ agent }) => agent === "catalogue-agent"));
}));
