import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(body, signature, secret) {
  if (!secret || typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export class SimulatedPaymentProvider {
  mode = "simulated";

  async createOrder({ amount, currency, receipt, notes }) {
    return {
      id: `order_sim_${randomUUID().replaceAll("-", "").slice(0, 14)}`,
      amount,
      currency,
      receipt,
      notes,
      status: "created",
      simulated: true
    };
  }
}

export class RazorpayPaymentProvider {
  mode = "razorpay_test";

  constructor({ keyId, keySecret, fetchImpl = fetch }) {
    if (!keyId?.startsWith("rzp_test_") || !keySecret) {
      throw new Error("Razorpay test credentials are required; live credentials are not accepted");
    }
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.fetch = fetchImpl;
  }

  async createOrder(order) {
    const response = await this.fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(order)
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.description ?? "Razorpay order creation failed");
    return { ...body, simulated: false, keyId: this.keyId };
  }
}

export function paymentProviderFromEnv(env = process.env) {
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    return new RazorpayPaymentProvider({ keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET });
  }
  return new SimulatedPaymentProvider();
}
