import { randomUUID } from "node:crypto";
import { ValidationError } from "./catalogue.js";

const STOP_WORDS = new Set([
  "i", "a", "an", "the", "need", "want", "looking", "for", "please", "show", "me", "find",
  "something", "that", "can", "arrive", "by", "within", "under", "below", "maximum", "max",
  "budget", "of", "rs", "rupees", "₹"
]);

export function parseShoppingRequest(message) {
  if (typeof message !== "string" || !message.trim()) throw new ValidationError("message must be a non-empty string");
  const budgetMatch = message.match(/(?:under|below|within|max(?:imum)?|budget(?:\s+of)?)\s*(?:₹|rs\.?|inr)?\s*([\d,]+)/i);
  const maxPrice = budgetMatch ? Number(budgetMatch[1].replaceAll(",", "")) : undefined;
  const withoutBudget = budgetMatch ? message.replace(budgetMatch[0], " ") : message;
  const query = withoutBudget
    .toLocaleLowerCase("en-IN")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word))
    .join(" ");
  return { query, ...(maxPrice === undefined ? {} : { maxPrice }) };
}

function clone(value) {
  return structuredClone(value);
}

export class CommerceService {
  #sessions = new Map();
  #orders = new Map();
  #audit = [];
  #recommendationMetrics = { impressions: 0, accepted: 0, rejected: 0, incrementalRevenue: 0 };

  constructor(catalogue, payments) {
    this.catalogue = catalogue;
    this.payments = payments;
  }

  #record(action, details) {
    this.#audit.push({ id: randomUUID(), timestamp: new Date().toISOString(), action, details: clone(details) });
  }

  #session(id) {
    const session = this.#sessions.get(id);
    if (!session) throw new ValidationError(`Shopping session not found: ${id}`);
    return session;
  }

  #cart(session) {
    const items = session.items.map(({ productId, quantity }) => {
      const product = this.catalogue.get(productId);
      return { productId, name: product.name, quantity, unitPrice: product.price, lineTotal: product.price * quantity };
    });
    return { items, total: items.reduce((sum, item) => sum + item.lineTotal, 0), currency: "INR" };
  }

  createSession({ spendingLimit } = {}) {
    if (spendingLimit !== undefined && (!Number.isFinite(spendingLimit) || spendingLimit <= 0)) {
      throw new ValidationError("spendingLimit must be a positive number");
    }
    const session = {
      id: randomUUID(), spendingLimit, items: [], messages: [], checkout: null,
      recommendationState: { fingerprint: null, shown: [], decisions: {} }
    };
    this.#sessions.set(session.id, session);
    this.#record("session.created", { sessionId: session.id, spendingLimit });
    return this.getSession(session.id);
  }

  getSession(id) {
    const session = this.#session(id);
    return { id: session.id, spendingLimit: session.spendingLimit, messages: clone(session.messages), cart: this.#cart(session), checkout: clone(session.checkout) };
  }

  message(sessionId, message) {
    const session = this.#session(sessionId);
    const parsed = parseShoppingRequest(message);
    const effectiveMaxPrice = parsed.maxPrice === undefined
      ? session.spendingLimit
      : Math.min(parsed.maxPrice, session.spendingLimit ?? Number.POSITIVE_INFINITY);
    const suggestions = this.catalogue.search({ query: parsed.query, maxPrice: effectiveMaxPrice, inStock: true });
    const reply = suggestions.length
      ? `I found ${suggestions.length} verified product${suggestions.length === 1 ? "" : "s"} from the merchant catalogue. Prices and stock were checked just now.`
      : "I couldn't find a verified in-stock product within those constraints. Try a broader request or a different budget.";
    session.messages.push({ role: "user", content: message }, { role: "assistant", content: reply });
    this.#record("conversation.message", { sessionId, parsed, suggestionIds: suggestions.map(({ id }) => id) });
    return { reply, suggestions, interpreted: parsed };
  }

  addToCart(sessionId, productId, quantity = 1, { preserveRecommendationState = false } = {}) {
    const session = this.#session(sessionId);
    if (session.checkout) throw new ValidationError("cart is locked after checkout approval");
    if (!Number.isInteger(quantity) || quantity < 1) throw new ValidationError("quantity must be a positive integer");
    const existing = session.items.find((item) => item.productId === productId);
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    const inventory = this.catalogue.checkInventory(productId, nextQuantity);
    if (!inventory.canFulfil) throw new ValidationError(`Insufficient stock: ${inventory.available} available`);
    const product = this.catalogue.get(productId);
    const currentTotal = this.#cart(session).total;
    const nextTotal = currentTotal + product.price * quantity;
    if (session.spendingLimit !== undefined && nextTotal > session.spendingLimit) {
      throw new ValidationError(`Cart total ₹${nextTotal} exceeds spending limit ₹${session.spendingLimit}`);
    }
    if (existing) existing.quantity = nextQuantity;
    else session.items.push({ productId, quantity });
    if (!preserveRecommendationState) {
      session.recommendationState = { fingerprint: null, shown: [], decisions: {} };
    }
    const cart = this.#cart(session);
    this.#record("cart.item_added", { sessionId, productId, quantity, total: cart.total });
    return cart;
  }

  removeFromCart(sessionId, productId) {
    const session = this.#session(sessionId);
    if (session.checkout) throw new ValidationError("cart is locked after checkout approval");
    const index = session.items.findIndex((item) => item.productId === productId);
    if (index < 0) throw new ValidationError(`Product is not in cart: ${productId}`);
    session.items.splice(index, 1);
    session.recommendationState = { fingerprint: null, shown: [], decisions: {} };
    const cart = this.#cart(session);
    this.#record("cart.item_removed", { sessionId, productId, total: cart.total });
    return cart;
  }

  #recommendationMetricsSnapshot() {
    const metrics = this.#recommendationMetrics;
    return {
      ...metrics,
      acceptanceRate: metrics.impressions ? metrics.accepted / metrics.impressions : 0
    };
  }

  getRecommendations(sessionId) {
    const session = this.#session(sessionId);
    if (session.checkout || !session.items.length) return [];
    const cart = this.#cart(session);
    const fingerprint = session.items.map(({ productId, quantity }) => `${productId}:${quantity}`).sort().join("|");
    if (session.recommendationState.fingerprint === fingerprint) return clone(session.recommendationState.shown);

    const cartIds = new Set(session.items.map(({ productId }) => productId));
    const cartProducts = session.items.map(({ productId }) => this.catalogue.get(productId));
    const remainingBudget = session.spendingLimit === undefined ? Number.POSITIVE_INFINITY : session.spendingLimit - cart.total;
    const recommendations = this.catalogue.list()
      .filter((candidate) => !cartIds.has(candidate.id) && candidate.inventory > 0 && candidate.price <= remainingBudget)
      .map((candidate) => {
        const paired = cartProducts.filter((product) => product.complements.includes(candidate.id) || candidate.complements.includes(product.id));
        if (!paired.length) return null;
        return {
          product: candidate,
          reason: `Pairs with ${paired.map(({ name }) => name).join(" and ")} while staying within your spending limit.`,
          projectedTotal: cart.total + candidate.price
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.product.price - b.product.price || a.product.name.localeCompare(b.product.name))
      .slice(0, 2);

    session.recommendationState = { fingerprint, shown: recommendations, decisions: {} };
    this.#recommendationMetrics.impressions += recommendations.length;
    this.#record("recommendation.shown", { sessionId, productIds: recommendations.map(({ product }) => product.id), cartTotal: cart.total });
    return clone(recommendations);
  }

  decideRecommendation(sessionId, productId, decision) {
    const session = this.#session(sessionId);
    if (!["accepted", "rejected"].includes(decision)) throw new ValidationError("decision must be accepted or rejected");
    const recommendation = session.recommendationState.shown.find(({ product }) => product.id === productId);
    if (!recommendation) throw new ValidationError(`Recommendation was not shown for product: ${productId}`);
    if (session.recommendationState.decisions[productId]) {
      return { decision: session.recommendationState.decisions[productId], cart: this.#cart(session), metrics: this.#recommendationMetricsSnapshot() };
    }
    if (decision === "accepted") {
      this.addToCart(sessionId, productId, 1, { preserveRecommendationState: true });
      this.#recommendationMetrics.accepted += 1;
      this.#recommendationMetrics.incrementalRevenue += recommendation.product.price;
    } else {
      this.#recommendationMetrics.rejected += 1;
    }
    session.recommendationState.decisions[productId] = decision;
    const cart = this.#cart(session);
    const metrics = this.#recommendationMetricsSnapshot();
    this.#record("recommendation.decided", { sessionId, productId, decision, cartTotal: cart.total });
    return { decision, cart, metrics };
  }

  recommendationMetrics() {
    return this.#recommendationMetricsSnapshot();
  }

  async approveCheckout(sessionId, approvedTotal) {
    const session = this.#session(sessionId);
    if (session.checkout) return clone(session.checkout);
    const cart = this.#cart(session);
    if (!cart.items.length) throw new ValidationError("cart is empty");
    if (!Number.isFinite(approvedTotal) || approvedTotal !== cart.total) {
      throw new ValidationError(`Cart total changed; approve the exact current total of ₹${cart.total}`);
    }
    const paymentOrder = await this.payments.createOrder({
      amount: cart.total * 100,
      currency: cart.currency,
      receipt: `session_${session.id.slice(0, 16)}`,
      notes: { sessionId: session.id }
    });
    session.checkout = { status: "awaiting_payment", approvedTotal, cart, paymentOrder };
    this.#orders.set(paymentOrder.id, session.id);
    this.#record("checkout.approved", { sessionId, approvedTotal, paymentOrderId: paymentOrder.id, simulated: paymentOrder.simulated });
    return clone(session.checkout);
  }

  recordPayment(orderId, paymentId) {
    const sessionId = this.#orders.get(orderId);
    if (!sessionId) throw new ValidationError(`Payment order not found: ${orderId}`);
    const session = this.#session(sessionId);
    if (session.checkout.status !== "paid") {
      session.checkout.status = "paid";
      session.checkout.paymentId = paymentId;
      session.checkout.paidAt = new Date().toISOString();
      this.#record("payment.captured", { sessionId, orderId, paymentId });
    }
    return clone(session.checkout);
  }

  auditLog() {
    return clone(this.#audit);
  }
}
