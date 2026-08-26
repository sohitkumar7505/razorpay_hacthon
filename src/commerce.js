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

function parseShoppingTurn(message) {
  const normalized = message.toLocaleLowerCase("en-IN").replace(/[-_]/g, " ");
  const parsed = parseShoppingRequest(message);
  const turn = {};
  if (/\b(skin\s*care|skin\s*cream|skincream|face\s*care)\b/.test(normalized)) turn.category = "skincare";
  if (/\bcream|moisturi[sz]er\b/.test(normalized)) turn.productType = "cream";
  else if (/\bserum\b/.test(normalized)) turn.productType = "serum";
  else if (/\bcleanser|face\s*wash\b/.test(normalized)) turn.productType = "cleanser";
  else if (/\b(gift\s*set|bundle)\b/.test(normalized)) turn.productType = "set";
  if (/\bdaily\s*(use|wear|routine)?\b|\bevery\s*day\b/.test(normalized)) turn.useCase = "daily-use";
  else if (/\bgift|present\b/.test(normalized)) turn.useCase = "gift";
  else if (/\bnight|overnight\b/.test(normalized)) turn.useCase = "night";
  else if (/\bsensitive\b/.test(normalized)) turn.useCase = "sensitive";
  else if (/\bhydrat|dry\s*skin\b/.test(normalized)) turn.useCase = "hydrating";
  if (parsed.maxPrice !== undefined) turn.maxPrice = parsed.maxPrice;
  return turn;
}

function productText(product) {
  return [product.name, product.description, product.category, ...product.tags].join(" ").toLocaleLowerCase("en-IN");
}

function describeContext(context) {
  return [context.category, context.productType, context.useCase?.replace("-", " "), context.maxPrice ? `under ₹${context.maxPrice}` : null].filter(Boolean).join(", ");
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

  createSession({ spendingLimit, purchaseHistory = [] } = {}) {
    if (spendingLimit !== undefined && (!Number.isFinite(spendingLimit) || spendingLimit <= 0)) {
      throw new ValidationError("spendingLimit must be a positive number");
    }
    if (!Array.isArray(purchaseHistory)) throw new ValidationError("purchaseHistory must be an array of product ids");
    purchaseHistory.forEach((productId) => this.catalogue.get(productId));
    const session = {
      id: randomUUID(), spendingLimit, items: [], messages: [], checkout: null,
      recommendationState: { fingerprint: null, shown: [], decisions: {} },
      shoppingContext: {}, purchaseHistory: [...new Set(purchaseHistory)], lastSuggestionIds: []
    };
    this.#sessions.set(session.id, session);
    this.#record("session.created", { sessionId: session.id, spendingLimit, purchaseHistory: session.purchaseHistory });
    return this.getSession(session.id);
  }

  getSession(id) {
    const session = this.#session(id);
    return { id: session.id, spendingLimit: session.spendingLimit, messages: clone(session.messages), shoppingContext: clone(session.shoppingContext), purchaseHistory: clone(session.purchaseHistory), cart: this.#cart(session), checkout: clone(session.checkout) };
  }

  previewShoppingContext(sessionId, message) {
    const session = this.#session(sessionId);
    const turn = parseShoppingTurn(message);
    const context = { ...session.shoppingContext, ...turn };
    if (context.maxPrice === undefined && session.spendingLimit !== undefined) context.maxPrice = session.spendingLimit;
    else if (context.maxPrice !== undefined && session.spendingLimit !== undefined) context.maxPrice = Math.min(context.maxPrice, session.spendingLimit);
    return context;
  }

  #contextualProducts(context, { relaxUseCase = false } = {}) {
    const useCaseTerms = {
      "daily-use": ["daily-use", "daily use", "everyday"],
      gift: ["gift", "gifting"],
      night: ["night", "overnight"],
      sensitive: ["sensitive", "fragrance-free"],
      hydrating: ["hydrat", "dry skin"]
    };
    return this.catalogue.list()
      .filter((product) => product.inventory > 0)
      .filter((product) => context.maxPrice === undefined || product.price <= context.maxPrice)
      .filter((product) => !context.category || product.category === context.category)
      .filter((product) => !context.productType || productText(product).includes(context.productType))
      .filter((product) => relaxUseCase || !context.useCase || useCaseTerms[context.useCase].some((term) => productText(product).includes(term)))
      .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
      .slice(0, 4);
  }

  message(sessionId, message) {
    const session = this.#session(sessionId);
    if (/\b(add|put)\b.*\b(cart|basket)\b/i.test(message)) {
      const requested = parseShoppingTurn(message);
      let candidates = session.lastSuggestionIds.map((id) => this.catalogue.get(id));
      if (requested.productType) candidates = candidates.filter((product) => productText(product).includes(requested.productType));
      const normalizedMessage = message.toLocaleLowerCase("en-IN");
      const namedCandidates = candidates.filter((product) => normalizedMessage.includes(product.name.toLocaleLowerCase("en-IN")));
      if (namedCandidates.length) candidates = namedCandidates;
      if (candidates.length === 1) {
        const product = candidates[0];
        const cart = this.addToCart(sessionId, product.id);
        const reply = `I added ${product.name} to your cart at the verified price of ₹${product.price}. Your cart total is ₹${cart.total}.`;
        const action = { type: "cart.added", productId: product.id, cart };
        session.messages.push({ role: "user", content: message }, { role: "assistant", content: reply });
        this.#record("conversation.cart_added", { sessionId, productId: product.id, cartTotal: cart.total });
        return { reply, suggestions: [], interpreted: clone(session.shoppingContext), memoryUsed: true, action };
      }
      const reply = candidates.length
        ? `I found ${candidates.length} matching options. Please choose one by name: ${candidates.map(({ name }) => name).join(" or ")}.`
        : "I do not have one clear product to add yet. Ask me to show products, then choose one by name.";
      const action = { type: "clarification.required", candidateIds: candidates.map(({ id }) => id) };
      session.messages.push({ role: "user", content: message }, { role: "assistant", content: reply });
      this.#record("conversation.clarification_required", { sessionId, candidateIds: action.candidateIds });
      return { reply, suggestions: candidates, interpreted: clone(session.shoppingContext), memoryUsed: true, action };
    }
    const hadContext = Object.keys(session.shoppingContext).length > 0;
    const interpreted = this.previewShoppingContext(sessionId, message);
    session.shoppingContext = interpreted;
    let suggestions = this.#contextualProducts(interpreted);
    let relaxed = false;
    if (!suggestions.length && interpreted.useCase) {
      suggestions = this.#contextualProducts(interpreted, { relaxUseCase: true });
      relaxed = suggestions.length > 0;
    }
    session.lastSuggestionIds = suggestions.map(({ id }) => id);
    const remembered = describeContext(interpreted);
    const reply = suggestions.length
      ? `${hadContext ? `I remembered your preferences (${remembered}). ` : ""}${relaxed ? "I don't have an exact use-case match, but these are the closest verified options" : `I found ${suggestions.length} verified option${suggestions.length === 1 ? "" : "s"}`}. Prices and stock were checked just now.`
      : `I remembered your preferences (${remembered}), but nothing in stock matches them within the current budget. Tell me which requirement you would like to change.`;
    session.messages.push({ role: "user", content: message }, { role: "assistant", content: reply });
    this.#record("conversation.message", { sessionId, interpreted, suggestionIds: suggestions.map(({ id }) => id), memoryUsed: hadContext });
    return { reply, suggestions, interpreted, memoryUsed: hadContext };
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
    if (session.checkout || (!session.items.length && !session.purchaseHistory.length)) return [];
    const cart = this.#cart(session);
    const fingerprint = `${session.items.map(({ productId, quantity }) => `${productId}:${quantity}`).sort().join("|")}::${session.purchaseHistory.slice().sort().join("|")}`;
    if (session.recommendationState.fingerprint === fingerprint) return clone(session.recommendationState.shown);

    const cartIds = new Set(session.items.map(({ productId }) => productId));
    const excludedIds = new Set([...cartIds, ...session.purchaseHistory]);
    const cartProducts = session.items.map(({ productId }) => this.catalogue.get(productId));
    const historyProducts = session.purchaseHistory.map((productId) => this.catalogue.get(productId));
    const remainingBudget = session.spendingLimit === undefined ? Number.POSITIVE_INFINITY : session.spendingLimit - cart.total;
    const recommendations = this.catalogue.list()
      .filter((candidate) => !excludedIds.has(candidate.id) && candidate.inventory > 0 && candidate.price <= remainingBudget)
      .map((candidate) => {
        const paired = cartProducts.filter((product) => product.complements.includes(candidate.id) || candidate.complements.includes(product.id));
        const historicalPair = historyProducts.filter((product) => product.complements.includes(candidate.id) || candidate.complements.includes(product.id));
        if (!paired.length && !historicalPair.length) return null;
        return {
          product: candidate,
          reason: paired.length
            ? `Pairs with ${paired.map(({ name }) => name).join(" and ")} in your cart while staying within your spending limit.`
            : `Based on your past purchase of ${historicalPair.map(({ name }) => name).join(" and ")}, this is a compatible add-on within your spending limit.`,
          sourcePriority: paired.length ? 0 : 1,
          projectedTotal: cart.total + candidate.price
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.sourcePriority - b.sourcePriority || a.product.price - b.product.price || a.product.name.localeCompare(b.product.name))
      .slice(0, 2);

    recommendations.forEach((recommendation) => delete recommendation.sourcePriority);

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

  recordPayment(orderId, paymentId, expectedSessionId) {
    const sessionId = this.#orders.get(orderId);
    if (!sessionId) throw new ValidationError(`Payment order not found: ${orderId}`);
    if (expectedSessionId !== undefined && sessionId !== expectedSessionId) {
      throw new ValidationError("Payment order does not belong to this shopping session");
    }
    const session = this.#session(sessionId);
    if (session.checkout.status !== "paid") {
      session.checkout.status = "paid";
      session.checkout.paymentId = paymentId;
      session.checkout.paidAt = new Date().toISOString();
      session.purchaseHistory = [...new Set([...session.purchaseHistory, ...session.items.map(({ productId }) => productId)])];
      this.#record("payment.captured", { sessionId, orderId, paymentId });
    }
    return clone(session.checkout);
  }

  auditLog() {
    return clone(this.#audit);
  }
}
