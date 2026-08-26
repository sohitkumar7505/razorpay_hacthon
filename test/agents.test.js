import test from "node:test";
import assert from "node:assert/strict";
import { AgentRuntime } from "../src/agents.js";
import { CampaignOrchestrator, defaultPerformanceData } from "../src/campaigns.js";
import { Catalogue } from "../src/catalogue.js";
import { CommerceService } from "../src/commerce.js";
import { SimulatedPaymentProvider } from "../src/payment.js";
import { seedProducts } from "../src/seed.js";

function runtime() {
  const catalogue = new Catalogue(seedProducts);
  const commerce = new CommerceService(catalogue, new SimulatedPaymentProvider());
  const campaigns = new CampaignOrchestrator(catalogue, defaultPerformanceData);
  return { commerce, agents: new AgentRuntime({ commerce, campaigns, env: {} }) };
}

test("runs shopping through specialized LangGraph agents with observable events", async () => {
  const { commerce, agents } = runtime();
  const session = commerce.createSession({ spendingLimit: 2000 });
  const result = await agents.runShopping(session.id, "I need a skincare gift under ₹1,000");
  assert.equal(result.suggestions[0].id, "serum-01");
  const run = agents.listRuns()[0];
  assert.equal(run.workflow, "shopping");
  assert.equal(run.status, "completed");
  assert.deepEqual(run.events.filter(({ status }) => status === "completed").map(({ agent }) => agent), [
    "intent-agent", "catalogue-agent", "guardrail-agent", "response-agent"
  ]);
  assert.equal(run.llmUsed, false);
});

test("runs checkout through cart, risk, payment and audit agents", async () => {
  const { commerce, agents } = runtime();
  const session = commerce.createSession({ spendingLimit: 2000 });
  commerce.addToCart(session.id, "serum-01", 1);
  const checkout = await agents.runCheckout(session.id, 799);
  assert.equal(checkout.paymentOrder.simulated, true);
  const run = agents.listRuns()[0];
  assert.deepEqual(run.events.filter(({ status }) => status === "completed").map(({ agent }) => agent), [
    "cart-agent", "risk-agent", "payment-agent", "audit-agent"
  ]);
});

test("exposes whether optional LLM enhancement is configured without exposing its key", () => {
  const { commerce } = runtime();
  const campaigns = new CampaignOrchestrator(commerce.catalogue, defaultPerformanceData);
  const agents = new AgentRuntime({ commerce, campaigns, env: { OPENAI_API_KEY: "secret", LLM_MODEL: "test-model" } });
  assert.deepEqual(agents.status(), {
    framework: "LangGraph",
    llmEnabled: true,
    model: "test-model",
    workflows: ["shopping", "recommendation", "checkout", "campaign"]
  });
  assert.doesNotMatch(JSON.stringify(agents.status()), /secret/);
});
