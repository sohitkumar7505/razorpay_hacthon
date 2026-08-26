import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, extname, join, normalize } from "node:path";
import { Catalogue, ValidationError } from "./catalogue.js";
import { CampaignOrchestrator, defaultPerformanceData } from "./campaigns.js";
import { CommerceService } from "./commerce.js";
import { paymentProviderFromEnv, verifyPaymentSignature, verifyWebhookSignature } from "./payment.js";
import { seedProducts } from "./seed.js";

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
  campaignPerformance = defaultPerformanceData
} = {}) {
  const commerce = new CommerceService(catalogue, payments);
  const campaigns = new CampaignOrchestrator(catalogue, campaignPerformance);
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json(response, 200, { status: "ok", service: "catalogue", payments: payments.mode ?? "custom" });
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
      const inventoryMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/inventory$/);
      if (request.method === "GET" && inventoryMatch) {
        const quantity = Number(url.searchParams.get("quantity") ?? "1");
        return json(response, 200, catalogue.checkInventory(decodeURIComponent(inventoryMatch[1]), quantity));
      }
      if (request.method === "GET" && url.pathname === "/api/audit") {
        return json(response, 200, { events: [...catalogue.auditLog(), ...commerce.auditLog(), ...campaigns.auditLog()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)) });
      }
      if (request.method === "POST" && url.pathname === "/api/sessions") {
        return json(response, 201, commerce.createSession(await requestBody(request)));
      }
      const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (request.method === "GET" && sessionMatch) {
        return json(response, 200, commerce.getSession(decodeURIComponent(sessionMatch[1])));
      }
      const messageMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      if (request.method === "POST" && messageMatch) {
        const body = await requestBody(request);
        return json(response, 200, commerce.message(decodeURIComponent(messageMatch[1]), body.message));
      }
      const cartMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/cart$/);
      if (request.method === "POST" && cartMatch) {
        const body = await requestBody(request);
        return json(response, 200, commerce.addToCart(decodeURIComponent(cartMatch[1]), body.productId, body.quantity));
      }
      const cartItemMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/cart\/([^/]+)$/);
      if (request.method === "DELETE" && cartItemMatch) {
        return json(response, 200, commerce.removeFromCart(decodeURIComponent(cartItemMatch[1]), decodeURIComponent(cartItemMatch[2])));
      }
      const checkoutMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/checkout$/);
      if (request.method === "POST" && checkoutMatch) {
        const body = await requestBody(request);
        return json(response, 201, await commerce.approveCheckout(decodeURIComponent(checkoutMatch[1]), body.approvedTotal));
      }
      const recommendationsMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/recommendations$/);
      if (request.method === "GET" && recommendationsMatch) {
        return json(response, 200, { recommendations: commerce.getRecommendations(decodeURIComponent(recommendationsMatch[1])) });
      }
      const recommendationDecisionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/recommendations\/([^/]+)$/);
      if (request.method === "POST" && recommendationDecisionMatch) {
        const body = await requestBody(request);
        return json(response, 200, commerce.decideRecommendation(
          decodeURIComponent(recommendationDecisionMatch[1]),
          decodeURIComponent(recommendationDecisionMatch[2]),
          body.decision
        ));
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
        return json(response, 201, campaigns.createProposal(await requestBody(request)));
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
        return json(response, 200, commerce.recordPayment(
          verification.orderId,
          verification.paymentId,
          decodeURIComponent(paymentVerificationMatch[1])
        ));
      }
      if (request.method === "POST" && url.pathname === "/api/webhooks/razorpay") {
        const body = await requestBody(request, { raw: true });
        const signature = request.headers["x-razorpay-signature"];
        if (!verifyWebhookSignature(body, signature, webhookSecret)) return json(response, 401, { error: "Invalid webhook signature" });
        const event = JSON.parse(body.toString("utf8"));
        if (event.event === "payment.captured") {
          const payment = event.payload?.payment?.entity;
          commerce.recordPayment(payment?.order_id, payment?.id);
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
  createApp().listen(port, () => console.log(`Catalogue running at http://localhost:${port}`));
}
