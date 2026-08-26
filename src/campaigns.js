import { randomUUID } from "node:crypto";
import { ValidationError } from "./catalogue.js";

export const defaultPerformanceData = Object.freeze([
  { productId: "serum-01", views: 1500, carts: 210, purchases: 120, benchmarkConversionRate: 0.08 },
  { productId: "cream-01", views: 1200, carts: 150, purchases: 24, benchmarkConversionRate: 0.08 },
  { productId: "gift-set-01", views: 800, carts: 96, purchases: 24, benchmarkConversionRate: 0.08 },
  { productId: "gift-wrap-01", views: 500, carts: 70, purchases: 35, benchmarkConversionRate: 0.08 }
]);

const POLICY = Object.freeze({
  maxBudget: 5000,
  maxDiscountPercent: 20,
  allowedAudiences: ["consented_cart_abandoners", "consented_recent_browsers"],
  allowedChannels: ["email", "whatsapp"],
  maxMessagesPerCustomer: 1,
  minStopLossSpend: 500,
  minRoas: 1
});

function clone(value) {
  return structuredClone(value);
}

function requireNonNegativeNumber(value, field) {
  if (!Number.isFinite(value) || value < 0) throw new ValidationError(`${field} must be a non-negative number`);
}

export class CampaignOrchestrator {
  #campaigns = new Map();
  #audit = [];

  constructor(catalogue, performanceData = defaultPerformanceData) {
    this.catalogue = catalogue;
    this.performanceData = clone(performanceData);
  }

  #record(action, details) {
    this.#audit.push({ id: randomUUID(), timestamp: new Date().toISOString(), action, details: clone(details) });
  }

  #campaign(id) {
    const campaign = this.#campaigns.get(id);
    if (!campaign) throw new ValidationError(`Campaign not found: ${id}`);
    return campaign;
  }

  opportunities() {
    return this.performanceData
      .filter(({ views }) => views >= 100)
      .map((evidence) => {
        const product = this.catalogue.get(evidence.productId);
        const conversionRate = evidence.purchases / evidence.views;
        const conversionGap = Math.max(0, evidence.benchmarkConversionRate - conversionRate);
        return {
          product,
          conversionRate,
          benchmarkConversionRate: evidence.benchmarkConversionRate,
          estimatedRevenueGap: Math.round(conversionGap * evidence.views * product.price),
          evidence: { views: evidence.views, carts: evidence.carts, purchases: evidence.purchases }
        };
      })
      .filter(({ estimatedRevenueGap }) => estimatedRevenueGap > 0)
      .sort((a, b) => b.estimatedRevenueGap - a.estimatedRevenueGap);
  }

  createProposal({ productId, budget, discountPercent, audience, channel, maxMessagesPerCustomer }) {
    const product = this.catalogue.get(productId);
    requireNonNegativeNumber(budget, "budget");
    requireNonNegativeNumber(discountPercent, "discount");
    if (budget === 0 || budget > POLICY.maxBudget) throw new ValidationError(`budget must be between ₹1 and ₹${POLICY.maxBudget}`);
    if (discountPercent > POLICY.maxDiscountPercent) throw new ValidationError(`discount cannot exceed ${POLICY.maxDiscountPercent}%`);
    if (!POLICY.allowedAudiences.includes(audience)) throw new ValidationError("audience must be consented and policy-approved");
    if (!POLICY.allowedChannels.includes(channel)) throw new ValidationError("channel is not policy-approved");
    if (!Number.isInteger(maxMessagesPerCustomer) || maxMessagesPerCustomer < 1 || maxMessagesPerCustomer > POLICY.maxMessagesPerCustomer) {
      throw new ValidationError(`frequency cannot exceed ${POLICY.maxMessagesPerCustomer} message per customer`);
    }
    const opportunity = this.opportunities().find(({ product: candidate }) => candidate.id === productId);
    if (!opportunity) throw new ValidationError("product does not have a measured campaign opportunity");
    const campaign = {
      id: randomUUID(),
      status: "draft",
      product,
      budget,
      discountPercent,
      audience,
      channel,
      maxMessagesPerCustomer,
      rationale: `${product.name} has a ${(opportunity.conversionRate * 100).toFixed(1)}% conversion rate against a ${(opportunity.benchmarkConversionRate * 100).toFixed(1)}% benchmark, creating an estimated ${opportunity.estimatedRevenueGap} INR revenue gap.`,
      message: `Still considering ${product.name}? Save ${discountPercent}% on your verified cart. You are receiving this because you opted in; you can opt out anytime.`,
      policyCheck: { passed: true, maxBudget: POLICY.maxBudget, maxDiscountPercent: POLICY.maxDiscountPercent, consentRequired: true, frequencyCap: POLICY.maxMessagesPerCustomer },
      approval: null,
      performance: { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
      report: { roas: 0, netRevenue: 0, clickThroughRate: 0, conversionRate: 0 },
      stopReason: null,
      createdAt: new Date().toISOString()
    };
    this.#campaigns.set(campaign.id, campaign);
    this.#record("campaign.proposed", { campaignId: campaign.id, productId, budget, discountPercent, audience, channel });
    return clone(campaign);
  }

  list() {
    return [...this.#campaigns.values()].map(clone);
  }

  get(id) {
    return clone(this.#campaign(id));
  }

  approve(id, { approvedBy } = {}) {
    const campaign = this.#campaign(id);
    if (campaign.status !== "draft") throw new ValidationError("only draft campaigns can be approved");
    if (typeof approvedBy !== "string" || !approvedBy.trim()) throw new ValidationError("approvedBy is required for human approval");
    campaign.status = "approved";
    campaign.approval = { approvedBy: approvedBy.trim(), approvedAt: new Date().toISOString() };
    this.#record("campaign.approved", { campaignId: id, approvedBy: campaign.approval.approvedBy });
    return clone(campaign);
  }

  launch(id) {
    const campaign = this.#campaign(id);
    if (campaign.status !== "approved" || !campaign.approval) throw new ValidationError("human approval is required before launch");
    campaign.status = "active";
    campaign.launchedAt = new Date().toISOString();
    this.#record("campaign.launched", { campaignId: id, budget: campaign.budget, channel: campaign.channel });
    return clone(campaign);
  }

  recordPerformance(id, batch) {
    const campaign = this.#campaign(id);
    if (campaign.status !== "active") throw new ValidationError("performance can be recorded only for an active campaign");
    for (const field of ["spend", "impressions", "clicks", "conversions", "revenue"]) requireNonNegativeNumber(batch[field], field);
    if (!["impressions", "clicks", "conversions"].every((field) => Number.isInteger(batch[field]))) {
      throw new ValidationError("impressions, clicks and conversions must be integers");
    }
    if (batch.clicks > batch.impressions || batch.conversions > batch.clicks) throw new ValidationError("performance funnel counts are inconsistent");
    if (campaign.performance.spend + batch.spend > campaign.budget) throw new ValidationError("performance batch would exceed campaign budget");
    for (const field of ["spend", "impressions", "clicks", "conversions", "revenue"]) campaign.performance[field] += batch[field];
    const totals = campaign.performance;
    campaign.report = {
      roas: totals.spend ? totals.revenue / totals.spend : 0,
      netRevenue: totals.revenue - totals.spend,
      clickThroughRate: totals.impressions ? totals.clicks / totals.impressions : 0,
      conversionRate: totals.clicks ? totals.conversions / totals.clicks : 0
    };
    if (totals.spend >= POLICY.minStopLossSpend && totals.conversions === 0) {
      campaign.status = "paused_stop_loss";
      campaign.stopReason = `Automatically paused after ₹${totals.spend} spend with zero conversions.`;
    } else if (totals.spend >= POLICY.minStopLossSpend && campaign.report.roas < POLICY.minRoas) {
      campaign.status = "paused_stop_loss";
      campaign.stopReason = `Automatically paused because ROAS ${campaign.report.roas.toFixed(2)} fell below ${POLICY.minRoas.toFixed(2)}.`;
    }
    this.#record("campaign.performance_recorded", { campaignId: id, batch, status: campaign.status, report: campaign.report, stopReason: campaign.stopReason });
    return clone(campaign);
  }

  auditLog() {
    return clone(this.#audit);
  }
}
