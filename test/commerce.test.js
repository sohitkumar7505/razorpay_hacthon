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
