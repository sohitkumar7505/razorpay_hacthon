import { randomUUID } from "node:crypto";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { ValidationError } from "./catalogue.js";
import { parseShoppingRequest } from "./commerce.js";

const AgentState = new StateSchema({
  runId: z.string(),
  sessionId: z.string().optional(),
  input: z.any().optional(),
  interpreted: z.any().optional(),
  context: z.any().optional(),
  result: z.any().optional()
});

function clone(value) {
  return structuredClone(value);
}

function safeDetails(value) {
  if (value === undefined) return {};
  return JSON.parse(JSON.stringify(value, (key, item) => /secret|api.?key/i.test(key) ? "[redacted]" : item));
}

class AgentRunStore {
  #runs = [];

  create(workflow, input, llmUsed) {
    const run = {
      id: randomUUID(), workflow, status: "running", llmUsed,
      startedAt: new Date().toISOString(), completedAt: null,
      input: safeDetails(input), output: null, error: null, events: []
    };
    this.#runs.unshift(run);
    if (this.#runs.length > 100) this.#runs.length = 100;
    return run;
  }

  event(runId, agent, status, details = {}) {
    const run = this.#runs.find(({ id }) => id === runId);
    if (!run) return;
    run.events.push({ id: randomUUID(), agent, status, timestamp: new Date().toISOString(), details: safeDetails(details) });
  }

  complete(runId, output) {
    const run = this.#runs.find(({ id }) => id === runId);
    run.status = "completed";
    run.completedAt = new Date().toISOString();
    run.output = safeDetails(output);
  }

  fail(runId, error) {
    const run = this.#runs.find(({ id }) => id === runId);
    run.status = "failed";
    run.completedAt = new Date().toISOString();
    run.error = error.message;
  }

  list(limit = 20) {
    return clone(this.#runs.slice(0, Math.max(1, Math.min(100, limit))));
  }
}

export class AgentRuntime {
  #store = new AgentRunStore();

  constructor({ commerce, campaigns, env = process.env }) {
    this.commerce = commerce;
    this.campaigns = campaigns;
    this.env = env;
    this.llmEnabled = Boolean(env.OPENAI_API_KEY);
    this.modelName = env.LLM_MODEL || "gpt-4o-mini";
    this.model = this.llmEnabled ? new ChatOpenAI({ apiKey: env.OPENAI_API_KEY, model: this.modelName, temperature: 0, maxRetries: 2 }) : null;
    this.shoppingGraph = this.#shoppingGraph();
    this.recommendationGraph = this.#recommendationGraph();
    this.checkoutGraph = this.#checkoutGraph();
    this.campaignGraph = this.#campaignGraph();
  }

  #node(agent, work) {
    return async (state) => {
      this.#store.event(state.runId, agent, "running", { task: state.input?.task ?? agent });
      try {
        const update = await work(state);
        this.#store.event(state.runId, agent, "completed", update?.result ?? update?.context ?? update?.interpreted ?? {});
        return update;
      } catch (error) {
        this.#store.event(state.runId, agent, "failed", { error: error.message });
        throw error;
      }
    };
  }

  #linearGraph(nodes) {
    let graph = new StateGraph(AgentState);
    for (const [name, node] of nodes) graph = graph.addNode(name, node);
    graph = graph.addEdge(START, nodes[0][0]);
    for (let index = 0; index < nodes.length - 1; index += 1) graph = graph.addEdge(nodes[index][0], nodes[index + 1][0]);
    return graph.addEdge(nodes.at(-1)[0], END).compile();
  }

  #shoppingGraph() {
    return this.#linearGraph([
      ["intent-agent", this.#node("intent-agent", async ({ input }) => ({ interpreted: parseShoppingRequest(input.message) }))],
      ["catalogue-agent", this.#node("catalogue-agent", async ({ sessionId, input }) => ({ result: this.commerce.message(sessionId, input.message) }))],
      ["guardrail-agent", this.#node("guardrail-agent", async ({ result, interpreted }) => {
        if (result.suggestions.some(({ inventory }) => inventory < 1)) throw new ValidationError("agent suggested unavailable inventory");
        if (interpreted.maxPrice !== undefined && result.suggestions.some(({ price }) => price > interpreted.maxPrice)) throw new ValidationError("agent exceeded requested budget");
        return { context: { verified: true, suggestionCount: result.suggestions.length } };
      })],
      ["response-agent", this.#node("response-agent", async ({ result, input }) => {
        if (!this.model || !result.suggestions.length) return { result };
        try {
          const groundedProducts = result.suggestions.map(({ id, name, price, inventory }) => ({ id, name, price, inventory }));
          const response = await this.model.invoke([
            ["system", "You are a concise shopping assistant. Use only the supplied verified products. Never invent prices, stock, offers, delivery promises, or policies."],
            ["human", `Request: ${input.message}\nVerified products: ${JSON.stringify(groundedProducts)}\nWrite one short helpful response.`]
          ]);
          const content = typeof response.content === "string" ? response.content : result.reply;
          return { result: { ...result, reply: content, responseMode: "llm-grounded" } };
        } catch {
          return { result: { ...result, responseMode: "deterministic-fallback" } };
        }
      })]
    ]);
  }

  #recommendationGraph() {
    return this.#linearGraph([
      ["cart-context-agent", this.#node("cart-context-agent", async ({ sessionId }) => ({ context: this.commerce.getSession(sessionId) }))],
      ["recommendation-agent", this.#node("recommendation-agent", async ({ sessionId }) => ({ result: this.commerce.getRecommendations(sessionId) }))],
      ["revenue-guard-agent", this.#node("revenue-guard-agent", async ({ result, context }) => {
        const limit = context.spendingLimit ?? Number.POSITIVE_INFINITY;
        if (result.some(({ projectedTotal, product }) => projectedTotal > limit || product.inventory < 1)) throw new ValidationError("unsafe recommendation generated");
        return { result };
      })]
    ]);
  }

  #checkoutGraph() {
    return this.#linearGraph([
      ["cart-agent", this.#node("cart-agent", async ({ sessionId }) => ({ context: this.commerce.getSession(sessionId) }))],
      ["risk-agent", this.#node("risk-agent", async ({ context, input }) => {
        if (!context.cart.items.length) throw new ValidationError("cart is empty");
        if (context.cart.total !== input.approvedTotal) throw new ValidationError("approved total does not match verified cart total");
        return { context: { ...context, riskApproved: true } };
      })],
      ["payment-agent", this.#node("payment-agent", async ({ sessionId, input }) => ({ result: await this.commerce.approveCheckout(sessionId, input.approvedTotal) }))],
      ["audit-agent", this.#node("audit-agent", async ({ result }) => ({ result }))]
    ]);
  }

  #campaignGraph() {
    return this.#linearGraph([
      ["opportunity-agent", this.#node("opportunity-agent", async ({ input }) => {
        const opportunity = this.campaigns.opportunities().find(({ product }) => product.id === input.proposal.productId);
        if (!opportunity) throw new ValidationError("no measured opportunity for selected product");
        return { context: opportunity };
      })],
      ["campaign-agent", this.#node("campaign-agent", async ({ input }) => ({ result: this.campaigns.createProposal(input.proposal) }))],
      ["compliance-agent", this.#node("compliance-agent", async ({ result }) => {
        if (!result.policyCheck.passed || result.status !== "draft") throw new ValidationError("campaign failed compliance review");
        return { result };
      })],
      ["campaign-audit-agent", this.#node("campaign-audit-agent", async ({ result }) => ({ result }))]
    ]);
  }

  async #invoke(workflow, graph, input, sessionId) {
    const run = this.#store.create(workflow, input, workflow === "shopping" && this.llmEnabled);
    try {
      const state = await graph.invoke({ runId: run.id, sessionId, input });
      this.#store.complete(run.id, state.result);
      return state.result;
    } catch (error) {
      this.#store.fail(run.id, error);
      throw error;
    }
  }

  runShopping(sessionId, message) {
    return this.#invoke("shopping", this.shoppingGraph, { task: "discover-products", message }, sessionId);
  }

  runRecommendations(sessionId) {
    return this.#invoke("recommendation", this.recommendationGraph, { task: "recommend-add-ons" }, sessionId);
  }

  runCheckout(sessionId, approvedTotal) {
    return this.#invoke("checkout", this.checkoutGraph, { task: "create-payment-order", approvedTotal }, sessionId);
  }

  runCampaign(proposal) {
    return this.#invoke("campaign", this.campaignGraph, { task: "propose-campaign", proposal });
  }

  listRuns(limit) {
    return this.#store.list(limit);
  }

  status() {
    return { framework: "LangGraph", llmEnabled: this.llmEnabled, model: this.modelName, workflows: ["shopping", "recommendation", "checkout", "campaign"] };
  }
}
