import test from "node:test";
import assert from "node:assert/strict";
import { Catalogue, ValidationError } from "../src/catalogue.js";
import { CommerceService, parseShoppingRequest } from "../src/commerce.js";
import { seedProducts } from "../src/seed.js";

class FakePayments {
  orders = [];
  async createOrder(order) {
    this.orders.push(order);
    return { id: "order_test_123", amount: order.amount, currency: order.currency, status: "created", simulated: true };
  }
}

test("extracts product intent and a rupee budget from natural language", () => {
  assert.deepEqual(parseShoppingRequest("I need a skincare gift under ₹2,000"), {
    query: "skincare gift",
    maxPrice: 2000
  });
});

test("conversation returns only authoritative products within the stated budget", () => {
  const service = new CommerceService(new Catalogue(seedProducts), new FakePayments());
  const session = service.createSession({ spendingLimit: 2000 });
  const response = service.message(session.id, "I need a skincare gift under ₹1,000");
  assert.equal(response.suggestions.length, 1);
  assert.equal(response.suggestions[0].id, "serum-01");
  assert.match(response.reply, /verified/i);
});

test("cart totals are calculated from catalogue prices and enforce spending limits", () => {
  const service = new CommerceService(new Catalogue(seedProducts), new FakePayments());
  const session = service.createSession({ spendingLimit: 1500 });
  assert.equal(service.addToCart(session.id, "serum-01", 1).total, 799);
  assert.throws(() => service.addToCart(session.id, "cream-01", 1), /spending limit/i);
  assert.equal(service.getSession(session.id).cart.total, 799);
});

test("cart rejects unavailable products instead of inventing stock", () => {
  const service = new CommerceService(new Catalogue(seedProducts), new FakePayments());
  const session = service.createSession();
  assert.throws(() => service.addToCart(session.id, "cleanser-01", 1), /stock/i);
});

test("checkout requires exact total approval and is idempotent", async () => {
  const payments = new FakePayments();
  const service = new CommerceService(new Catalogue(seedProducts), payments);
  const session = service.createSession({ spendingLimit: 2000 });
  service.addToCart(session.id, "serum-01", 1);
  await assert.rejects(() => service.approveCheckout(session.id, 800), /changed/i);
  const first = await service.approveCheckout(session.id, 799);
  const second = await service.approveCheckout(session.id, 799);
  assert.equal(first.paymentOrder.id, "order_test_123");
  assert.deepEqual(second, first);
  assert.equal(payments.orders.length, 1);
});

test("paid webhook updates a known order and ignores duplicate delivery", async () => {
  const service = new CommerceService(new Catalogue(seedProducts), new FakePayments());
  const session = service.createSession();
  service.addToCart(session.id, "serum-01", 1);
  await service.approveCheckout(session.id, 799);
  assert.equal(service.recordPayment("order_test_123", "pay_123").status, "paid");
  assert.equal(service.recordPayment("order_test_123", "pay_123").status, "paid");
  assert.throws(() => service.recordPayment("unknown", "pay_404"), ValidationError);
});

test("recommends only compatible, in-stock add-ons within the remaining budget", () => {
  const service = new CommerceService(new Catalogue(seedProducts), new FakePayments());
  const session = service.createSession({ spendingLimit: 2000 });
  service.addToCart(session.id, "serum-01", 1);
  const recommendations = service.getRecommendations(session.id);
  assert.ok(recommendations.length >= 1 && recommendations.length <= 2);
  assert.equal(recommendations[0].product.id, "gift-wrap-01");
  assert.equal(recommendations[0].projectedTotal, 998);
  assert.match(recommendations[0].reason, /pairs with/i);
  assert.ok(recommendations.every((item) => item.product.inventory > 0 && item.projectedTotal <= 2000));
});

test("returns no recommendation when every compatible add-on exceeds the remaining budget", () => {
  const service = new CommerceService(new Catalogue(seedProducts), new FakePayments());
  const session = service.createSession({ spendingLimit: 900 });
  service.addToCart(session.id, "serum-01", 1);
  assert.deepEqual(service.getRecommendations(session.id), []);
});

test("accepts only a shown recommendation and measures incremental revenue honestly", () => {
  const service = new CommerceService(new Catalogue(seedProducts), new FakePayments());
  const session = service.createSession({ spendingLimit: 2000 });
  service.addToCart(session.id, "serum-01", 1);
  const shown = service.getRecommendations(session.id);
  assert.throws(() => service.decideRecommendation(session.id, "cream-01", "accepted"), /not shown/i);
  const decision = service.decideRecommendation(session.id, shown[0].product.id, "accepted");
  assert.equal(decision.cart.total, 998);
  assert.equal(decision.metrics.impressions, shown.length);
  assert.equal(decision.metrics.accepted, 1);
  assert.equal(decision.metrics.incrementalRevenue, 199);
  assert.equal(decision.metrics.acceptanceRate, 1 / shown.length);
});

test("invalidates recommendation decisions when the cart changes", () => {
  const service = new CommerceService(new Catalogue(seedProducts), new FakePayments());
  const session = service.createSession({ spendingLimit: 2000 });
  service.addToCart(session.id, "serum-01", 1);
  service.getRecommendations(session.id);
  service.decideRecommendation(session.id, "gift-wrap-01", "accepted");
  service.removeFromCart(session.id, "gift-wrap-01");
  const refreshed = service.getRecommendations(session.id);
  assert.equal(refreshed[0].product.id, "gift-wrap-01");
  assert.equal(service.decideRecommendation(session.id, "gift-wrap-01", "accepted").cart.total, 998);
});
