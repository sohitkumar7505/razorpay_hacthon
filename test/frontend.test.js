import test from "node:test";
import assert from "node:assert/strict";
import { buildRazorpayOptions, buildSearchParams, formatMoney, getPageFromPath } from "../frontend/catalogue-ui.js";

test("builds bounded catalogue search parameters without empty values", () => {
  const params = buildSearchParams({ query: " skincare gift ", maxPrice: "2000", inStock: true });
  assert.equal(params.toString(), "q=skincare+gift&maxPrice=2000&inStock=true");
});

test("preserves an explicit all-inventory search", () => {
  const params = buildSearchParams({ query: "", maxPrice: "", inStock: false });
  assert.equal(params.toString(), "inStock=false");
});

test("formats catalogue prices as Indian rupees", () => {
  assert.equal(formatMoney(1899), "₹1,899");
});

test("builds Razorpay Checkout options from public order fields only", () => {
  const handler = () => {};
  const options = buildRazorpayOptions({
    id: "order_test_123", keyId: "rzp_test_public", amount: 79900, currency: "INR"
  }, handler, () => {});
  assert.equal(options.key, "rzp_test_public");
  assert.equal(options.order_id, "order_test_123");
  assert.equal(options.amount, 79900);
  assert.equal(options.handler, handler);
  assert.equal("keySecret" in options, false);
});

test("separates customer and merchant routes with a safe customer default", () => {
  assert.equal(getPageFromPath("/customer"), "customer");
  assert.equal(getPageFromPath("/merchant"), "merchant");
  assert.equal(getPageFromPath("/"), "customer");
  assert.equal(getPageFromPath("/unknown"), "customer");
});
