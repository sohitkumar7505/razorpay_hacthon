import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { paymentProviderFromEnv, verifyPaymentSignature, verifyWebhookSignature } from "../src/payment.js";

test("verifies Razorpay webhook signatures without timing-unsafe comparison", () => {
  const body = Buffer.from('{"event":"payment.captured"}');
  const signature = createHmac("sha256", "secret").update(body).digest("hex");
  assert.equal(verifyWebhookSignature(body, signature, "secret"), true);
  assert.equal(verifyWebhookSignature(body, "0".repeat(64), "secret"), false);
  assert.equal(verifyWebhookSignature(body, "bad", "secret"), false);
});

test("verifies the Razorpay Checkout payment signature", () => {
  const orderId = "order_test_123";
  const paymentId = "pay_test_456";
  const signature = createHmac("sha256", "key_secret").update(`${orderId}|${paymentId}`).digest("hex");
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature }, "key_secret"), true);
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: "0".repeat(64) }, "key_secret"), false);
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: "bad" }, "key_secret"), false);
});

test("uses simulation unless Razorpay mode is explicitly enabled", () => {
  assert.equal(paymentProviderFromEnv({ RAZORPAY_KEY_ID: "stale", RAZORPAY_KEY_SECRET: "stale" }).mode, "simulated");
  assert.throws(() => paymentProviderFromEnv({ PAYMENT_MODE: "razorpay" }), /requires/i);
  assert.throws(() => paymentProviderFromEnv({ PAYMENT_MODE: "razorpay", RAZORPAY_KEY_ID: "rzp_live_bad", RAZORPAY_KEY_SECRET: "secret" }), /test credentials/i);
});
