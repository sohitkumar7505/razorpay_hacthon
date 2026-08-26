import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "../src/payment.js";

test("verifies Razorpay webhook signatures without timing-unsafe comparison", () => {
  const body = Buffer.from('{"event":"payment.captured"}');
  const signature = createHmac("sha256", "secret").update(body).digest("hex");
  assert.equal(verifyWebhookSignature(body, signature, "secret"), true);
  assert.equal(verifyWebhookSignature(body, "0".repeat(64), "secret"), false);
  assert.equal(verifyWebhookSignature(body, "bad", "secret"), false);
});
