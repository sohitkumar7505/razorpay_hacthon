import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, extname, join, normalize } from "node:path";
import { Catalogue, ValidationError } from "./catalogue.js";
import { AgentRuntime } from "./agents.js";
import { CampaignOrchestrator, defaultPerformanceData } from "./campaigns.js";
import { CommerceService } from "./commerce.js";
import { paymentProviderFromEnv, verifyPaymentSignature, verifyWebhookSignature } from "./payment.js";
import { seedProducts } from "./seed.js";
import { CommerceDatabase } from "./database.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function requestBody(request, { raw = false } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new ValidationError("request body exceeds 1 MB");
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  if (raw) return body;
  try {
    return body.length ? JSON.parse(body.toString("utf8")) : {};
  } catch {
    throw new ValidationError("request body must be valid JSON");
  }
}

async function staticFile(pathname, response) {
  const relative = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, "");
  if (relative.includes("..")) return false;
  try {
    const body = await readFile(join(publicDir, relative));
    response.writeHead(200, { "content-type": contentTypes[extname(relative)] ?? "application/octet-stream" });
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

async function appShell(response) {
  try {
    const body = await readFile(join(publicDir, "index.html"));
    response.writeHead(200, { "content-type": contentTypes[".html"] });
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

export function createApp({
  catalogue = new Catalogue(seedProducts),
  payments = paymentProviderFromEnv(),
  webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET,
  paymentVerificationSecret = process.env.RAZORPAY_KEY_SECRET,
  campaignPerformance = defaultPerformanceData,
  agentEnv = process.env,
  database = null,
  commerceService = null
} = {}) {
  const commerce = commerceService ?? new CommerceService(catalogue, payments);
  const campaigns = new CampaignOrchestrator(catalogue, campaignPerformance);
  const agents = new AgentRuntime({ commerce, campaigns, env: agentEnv });
  const persist = async (sessionId) => {
    if (!database) return;
    const state = commerce.exportSession(sessionId);
    await database.saveSession(state);
    if (state.checkout) await database.saveOrder({
      id: state.checkout.paymentOrder.id, sessionId: state.id, customerId: state.customerId,
      paymentId: state.checkout.paymentId, status: state.checkout.status,
      total: state.checkout.approvedTotal, items: state.checkout.cart.items
    });
  };
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json(response, 200, { status: "ok", service: "catalogue", payments: payments.mode ?? "custom", ...(database ? { database: "postgresql" } : {}) });
      }
      if (request.method === "GET" && url.pathname === "/api/customers") {
        return json(response, 200, { customers: database ? await database.listCustomers() : [] });
      }
      if (request.method === "POST" && url.pathname === "/api/customers") {
        if (!database) return json(response, 503, { error: "PostgreSQL is not configured" });
        const body = await requestBody(request);
        if (!body.id || !body.name || !body.email) throw new ValidationError("customer id, name and email are required");
        await database.saveCustomer(body);
        return json(response, 201, body);
      }
      const customerOrdersMatch = url.pathname.match(/^\/api\/customers\/([^/]+)\/orders$/);
      if (request.method === "GET" && customerOrdersMatch) {
        return json(response, 200, { orders: database ? await database.ordersForCustomer(decodeURIComponent(customerOrdersMatch[1])) : [] });
      }
      if (request.method === "GET" && url.pathname === "/api/agents/status") {
        return json(response, 200, agents.status());
      }
      if (request.method === "GET" && url.pathname === "/api/agents/runs") {
        return json(response, 200, { runs: agents.listRuns(Number(url.searchParams.get("limit") ?? 20)) });
      }
      if (request.method === "GET" && url.pathname === "/api/products") {
        const rawMaxPrice = url.searchParams.get("maxPrice");
        const maxPrice = rawMaxPrice === null || rawMaxPrice === "" ? undefined : Number(rawMaxPrice);
        if (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
          throw new ValidationError("maxPrice must be a non-negative number");
        }
        const products = catalogue.search({
          query: url.searchParams.get("q") ?? "",
          maxPrice,
          category: url.searchParams.get("category") ?? undefined,
          inStock: url.searchParams.get("inStock") === "true"
        });
        return json(response, 200, { count: products.length, products });
      }
      if (request.method === "POST" && url.pathname === "/api/products") {
        const product = catalogue.upsert(await requestBody(request));
        if (database) await database.saveProduct(product);
        return json(response, 201, product);
      }
      if (request.method === "POST" && url.pathname === "/api/products/import") {
        const { products = [] } = await requestBody(request);
        if (!Array.isArray(products)) throw new ValidationError("products must be an array");
        const imported = [], errors = [];
        for (const input of products) {
          try { const product = catalogue.upsert(input); if (database) await database.saveProduct(product); imported.push(product.id); }
          catch (error) { errors.push({ productId: input?.id, error: error.message }); }
        }
        return json(response, errors.length ? 207 : 201, { imported, errors });
      }
      const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
      if (request.method === "PUT" && productMatch) {
        const body = await requestBody(request);
        const product = catalogue.upsert({ ...body, id: decodeURIComponent(productMatch[1]) });
        if (database) await database.saveProduct(product);
        return json(response, 200, product);
      }
      if (request.method === "DELETE" && productMatch) {
        catalogue.remove(decodeURIComponent(productMatch[1]));
        if (database) await database.deleteProduct(decodeURIComponent(productMatch[1]));
        return json(response, 200, { deleted: true });
      }
      if (url.pathname === "/api/merchant/settings" && request.method === "GET") {
        const settings = database ? await database.loadSettings() : null;
        return json(response, 200, settings ?? { maxCustomerSpend: 2000, maxDiscountPercent: 20, approvalThreshold: 1000, prohibitedProductIds: [], shippingPolicy: "India-wide delivery in 2–5 business days", returnPolicy: "Returnable products accepted within 7 days" });
      }
      if (url.pathname === "/api/merchant/settings" && request.method === "PUT") {
        const settings = await requestBody(request);
        if (database) await database.saveSettings(settings);
        return json(response, 200, settings);
      }
      const inventoryMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/inventory$/);
      if (request.method === "GET" && inventoryMatch) {
        const quantity = Number(url.searchParams.get("quantity") ?? "1");
        return json(response, 200, catalogue.checkInventory(decodeURIComponent(inventoryMatch[1]), quantity));
      }
      if (request.method === "GET" && url.pathname === "/api/audit") {
        return json(response, 200, { events: [...catalogue.auditLog(), ...commerce.auditLog(), ...campaigns.auditLog()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)) });
      }
      if (request.method === "POST" && url.pathname === "/api/sessions") {
        const body = await requestBody(request);
        const settings = database ? await database.loadSettings() : null;
        if (settings?.maxCustomerSpend) body.spendingLimit = Math.min(body.spendingLimit ?? settings.maxCustomerSpend, settings.maxCustomerSpend);
        const session = commerce.createSession(body);
        await persist(session.id);
        return json(response, 201, session);
      }
      const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (request.method === "GET" && sessionMatch) {
        return json(response, 200, commerce.getSession(decodeURIComponent(sessionMatch[1])));
      }
      const messageMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      if (request.method === "POST" && messageMatch) {
        const body = await requestBody(request);
        const sessionId = decodeURIComponent(messageMatch[1]);
        const result = await agents.runShopping(sessionId, body.message);
        await persist(sessionId);
        return json(response, 200, result);
      }
      const cartMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/cart$/);
      if (request.method === "POST" && cartMatch) {
        const body = await requestBody(request);
        const sessionId = decodeURIComponent(cartMatch[1]);
        const settings = database ? await database.loadSettings() : null;
        if (settings?.prohibitedProductIds?.includes(body.productId)) throw new ValidationError("Merchant policy prohibits the agent from selling this product");
        const cart = body.quantityMode === "set" ? commerce.setCartQuantity(sessionId, body.productId, body.quantity) : commerce.addToCart(sessionId, body.productId, body.quantity);
        await persist(sessionId);
        return json(response, 200, cart);
      }
      const cartItemMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/cart\/([^/]+)$/);
      if (request.method === "DELETE" && cartItemMatch) {
        const sessionId = decodeURIComponent(cartItemMatch[1]);
        const cart = commerce.removeFromCart(sessionId, decodeURIComponent(cartItemMatch[2]));
        await persist(sessionId);
        return json(response, 200, cart);
      }
      const checkoutMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/checkout$/);
      if (request.method === "POST" && checkoutMatch) {
        const body = await requestBody(request);
        const sessionId = decodeURIComponent(checkoutMatch[1]);
        const checkout = await agents.runCheckout(sessionId, body.approvedTotal);
        await persist(sessionId);
        return json(response, 201, checkout);
      }
      const recommendationsMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/recommendations$/);
      if (request.method === "GET" && recommendationsMatch) {
        return json(response, 200, { recommendations: await agents.runRecommendations(decodeURIComponent(recommendationsMatch[1])) });
      }
      const recommendationDecisionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/recommendations\/([^/]+)$/);
      if (request.method === "POST" && recommendationDecisionMatch) {
        const body = await requestBody(request);
        const sessionId = decodeURIComponent(recommendationDecisionMatch[1]);
        const result = commerce.decideRecommendation(
          sessionId,
          decodeURIComponent(recommendationDecisionMatch[2]),
          body.decision
        );
        await persist(sessionId);
        return json(response, 200, result);
      }
      if (request.method === "GET" && url.pathname === "/api/recommendations/metrics") {
        return json(response, 200, commerce.recommendationMetrics());
      }
      if (request.method === "GET" && url.pathname === "/api/campaigns/opportunities") {
        return json(response, 200, { opportunities: campaigns.opportunities() });
      }
      if (request.method === "GET" && url.pathname === "/api/campaigns") {
        return json(response, 200, { campaigns: campaigns.list() });
      }
      if (request.method === "POST" && url.pathname === "/api/campaigns") {
        return json(response, 201, await agents.runCampaign(await requestBody(request)));
      }
      const campaignMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)$/);
      if (request.method === "GET" && campaignMatch) {
        return json(response, 200, campaigns.get(decodeURIComponent(campaignMatch[1])));
      }
      const campaignApproveMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/approve$/);
      if (request.method === "POST" && campaignApproveMatch) {
        return json(response, 200, campaigns.approve(decodeURIComponent(campaignApproveMatch[1]), await requestBody(request)));
      }
      const campaignLaunchMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/launch$/);
      if (request.method === "POST" && campaignLaunchMatch) {
        return json(response, 200, campaigns.launch(decodeURIComponent(campaignLaunchMatch[1])));
      }
      const campaignPerformanceMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/performance$/);
      if (request.method === "POST" && campaignPerformanceMatch) {
        return json(response, 200, campaigns.recordPerformance(decodeURIComponent(campaignPerformanceMatch[1]), await requestBody(request)));
      }
      const paymentVerificationMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/payment\/verify$/);
      if (request.method === "POST" && paymentVerificationMatch) {
        const body = await requestBody(request);
        const verification = {
          orderId: body.razorpay_order_id,
          paymentId: body.razorpay_payment_id,
          signature: body.razorpay_signature
        };
        if (!paymentVerificationSecret) return json(response, 503, { error: "Razorpay payment verification is not configured" });
        if (!verifyPaymentSignature(verification, paymentVerificationSecret)) return json(response, 401, { error: "Invalid Razorpay payment signature" });
        const checkout = commerce.recordPayment(
          verification.orderId,
          verification.paymentId,
          decodeURIComponent(paymentVerificationMatch[1])
        );
        await persist(decodeURIComponent(paymentVerificationMatch[1]));
        return json(response, 200, checkout);
      }
      if (request.method === "POST" && url.pathname === "/api/webhooks/razorpay") {
        const body = await requestBody(request, { raw: true });
        const signature = request.headers["x-razorpay-signature"];
        if (!verifyWebhookSignature(body, signature, webhookSecret)) return json(response, 401, { error: "Invalid webhook signature" });
        const event = JSON.parse(body.toString("utf8"));
        if (event.event === "payment.captured") {
          const payment = event.payload?.payment?.entity;
          const checkout = commerce.recordPayment(payment?.order_id, payment?.id);
          await persist(commerce.orderSessionId?.(checkout.paymentOrder.id) ?? checkout.paymentOrder.notes?.sessionId);
        }
        return json(response, 200, { received: true });
      }
      if (request.method === "GET" && await staticFile(url.pathname, response)) return;
      if (request.method === "GET" && !url.pathname.startsWith("/api/") && await appShell(response)) return;
      json(response, 404, { error: "Not found" });
    } catch (error) {
      if (error instanceof ValidationError) return json(response, 400, { error: error.message });
      console.error(error);
      json(response, 500, { error: "Internal server error" });
    }
  });
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  const port = Number(process.env.PORT ?? 3000);
  let database = null;
  if (process.env.DATABASE_URL) {
    database = new CommerceDatabase(process.env.DATABASE_URL);
    await database.initialize();
  }
  const storedProducts = database ? await database.loadProducts() : [];
  const catalogue = new Catalogue(storedProducts.length ? storedProducts : seedProducts);
  if (database && !storedProducts.length) for (const product of seedProducts) await database.saveProduct(product);
  const payments = paymentProviderFromEnv();
  const commerce = new CommerceService(catalogue, payments);
  if (database) for (const state of await database.loadSessions()) commerce.restoreSession(state);
  createApp({ catalogue, payments, commerceService: commerce, database }).listen(port, () => console.log(`Catalogue running at http://localhost:${port}`));
}
