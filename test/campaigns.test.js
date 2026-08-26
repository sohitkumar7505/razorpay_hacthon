import test from "node:test";
import assert from "node:assert/strict";
import { Catalogue, ValidationError } from "../src/catalogue.js";
import { CampaignOrchestrator, defaultPerformanceData } from "../src/campaigns.js";
import { seedProducts } from "../src/seed.js";

function orchestrator() {
  return new CampaignOrchestrator(new Catalogue(seedProducts), defaultPerformanceData);
}

const validProposal = {
  productId: "cream-01",
  budget: 1500,
  discountPercent: 10,
  audience: "consented_cart_abandoners",
  channel: "email",
  maxMessagesPerCustomer: 1
};

test("detects underperforming products from measured funnel data", () => {
  const opportunities = orchestrator().opportunities();
  assert.ok(opportunities.length >= 1);
  assert.equal(opportunities[0].product.id, "cream-01");
  assert.ok(opportunities[0].conversionRate < opportunities[0].benchmarkConversionRate);
  assert.ok(opportunities[0].estimatedRevenueGap > 0);
  assert.ok(opportunities[0].evidence.views >= 100);
});

test("creates an explainable bounded proposal", () => {
  const campaign = orchestrator().createProposal(validProposal);
  assert.equal(campaign.status, "draft");
  assert.equal(campaign.policyCheck.passed, true);
  assert.match(campaign.rationale, /conversion/i);
  assert.match(campaign.message, /Night Repair Cream/);
});

test("rejects campaigns outside merchant policy", () => {
  const service = orchestrator();
  assert.throws(() => service.createProposal({ ...validProposal, budget: 5001 }), /budget/i);
  assert.throws(() => service.createProposal({ ...validProposal, discountPercent: 21 }), /discount/i);
  assert.throws(() => service.createProposal({ ...validProposal, audience: "all_customers" }), /audience/i);
  assert.throws(() => service.createProposal({ ...validProposal, maxMessagesPerCustomer: 2 }), /frequency/i);
});

test("requires explicit human approval before simulated launch", () => {
  const service = orchestrator();
  const campaign = service.createProposal(validProposal);
  assert.throws(() => service.launch(campaign.id), /approval/i);
  assert.throws(() => service.approve(campaign.id, { approvedBy: "" }), ValidationError);
  assert.equal(service.approve(campaign.id, { approvedBy: "merchant-demo" }).status, "approved");
  assert.equal(service.launch(campaign.id).status, "active");
});

test("automatically pauses a poor campaign using its stop-loss rule", () => {
  const service = orchestrator();
  const campaign = service.createProposal(validProposal);
  service.approve(campaign.id, { approvedBy: "merchant-demo" });
  service.launch(campaign.id);
  const result = service.recordPerformance(campaign.id, {
    spend: 600, impressions: 1000, clicks: 10, conversions: 0, revenue: 0
  });
  assert.equal(result.status, "paused_stop_loss");
  assert.match(result.stopReason, /zero conversions/i);
  assert.equal(result.report.roas, 0);
});

test("reports measured revenue and prevents spend beyond campaign budget", () => {
  const service = orchestrator();
  const campaign = service.createProposal(validProposal);
  service.approve(campaign.id, { approvedBy: "merchant-demo" });
  service.launch(campaign.id);
  const result = service.recordPerformance(campaign.id, {
    spend: 400, impressions: 1000, clicks: 120, conversions: 10, revenue: 12990
  });
  assert.equal(result.status, "active");
  assert.equal(result.report.roas, 32.475);
  assert.equal(result.report.netRevenue, 12590);
  assert.throws(() => service.recordPerformance(campaign.id, {
    spend: 1200, impressions: 100, clicks: 10, conversions: 1, revenue: 1299
  }), /budget/i);
});
