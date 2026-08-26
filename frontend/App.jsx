import { useCallback, useEffect, useRef, useState } from "react";
import { buildRazorpayOptions, buildSearchParams, formatMoney, getPageFromPath } from "./catalogue-ui.js";

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: options.body ? { "content-type": "application/json", ...options.headers } : options.headers });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

let razorpayScriptPromise;
function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (razorpayScriptPromise) return razorpayScriptPromise;
  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay Checkout did not initialize"));
    script.onerror = () => reject(new Error("Unable to load Razorpay Checkout"));
    document.head.append(script);
  });
  return razorpayScriptPromise;
}

function Metric({ label, value }) {
  return <div><dt className="text-[11px] text-slate-500">{label}</dt><dd className="mt-1 text-sm font-bold text-slate-200">{value}</dd></div>;
}

function ProductCard({ product, onAdd }) {
  const visual = product.category === "skincare" ? "✦" : "◈";
  return (
    <article className="group rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/80 to-slate-950 p-5 shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-blue-400/40">
      <div aria-hidden="true" className="mb-4 grid h-28 place-items-center rounded-xl bg-gradient-to-br from-blue-500/25 via-violet-400/10 to-emerald-400/20 text-5xl text-blue-200">{visual}</div>
      <div className="flex items-start justify-between gap-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-500"><span>{product.category}</span><strong className="text-lg tracking-normal text-blue-300">{formatMoney(product.price)}</strong></div>
      <h3 className="mt-4 text-lg font-bold tracking-tight text-white">{product.name}</h3>
      <p className="mt-2 leading-6 text-slate-400">{product.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">{product.tags.map((tag) => <span key={tag} className="rounded-full bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-200">{tag}</span>)}</div>
      <div className="mt-5 flex items-end justify-between border-t border-white/10 pt-4">
        <dl className="flex gap-5"><Metric label="Inventory" value={product.inventory} /><Metric label="Ships" value={`${product.shippingDays} days`} /></dl>
        <button onClick={() => onAdd(product)} className="rounded-lg bg-white px-3 py-2 text-sm font-extrabold text-slate-950 transition hover:bg-blue-100">Add to cart</button>
      </div>
    </article>
  );
}

function Cart({ session, busy, onRemove, onQuantity, onCheckout }) {
  const cart = session?.cart ?? { items: [], total: 0 };
  const checkout = session?.checkout;
  return (
    <aside className="rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold">Guarded cart</h2><span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300">Limit {formatMoney(session?.spendingLimit ?? 0)}</span></div>
      {!cart.items.length ? <p className="py-8 text-center text-sm text-slate-500">Your cart is empty.</p> : (
        <div className="mt-5 space-y-4">
          {cart.items.map((item) => <div key={item.productId} className="flex items-start justify-between gap-3 border-b border-white/10 pb-4"><div><p className="font-bold text-slate-200">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.quantity} × {formatMoney(item.unitPrice)}</p>{!checkout && <div className="mt-2 flex items-center gap-2"><button aria-label={`Decrease ${item.name}`} disabled={item.quantity <= 1 || busy} onClick={() => onQuantity(item.productId, item.quantity - 1)} className="size-7 rounded bg-white/5">−</button><span className="text-xs font-bold">{item.quantity}</span><button aria-label={`Increase ${item.name}`} disabled={busy} onClick={() => onQuantity(item.productId, item.quantity + 1)} className="size-7 rounded bg-white/5">+</button></div>}</div>{!checkout && <button onClick={() => onRemove(item.productId)} aria-label={`Remove ${item.name}`} className="text-xs font-bold text-rose-300 hover:text-rose-200">Remove</button>}</div>)}
          <div className="flex items-center justify-between pt-1"><span className="text-sm text-slate-400">Verified total</span><strong className="text-2xl text-white">{formatMoney(cart.total)}</strong></div>
          {!checkout ? <button disabled={busy} onClick={onCheckout} className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-extrabold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50">Approve {formatMoney(cart.total)} & create test order</button> : (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200"><p className="font-extrabold">{checkout.status === "paid" ? "✓ Order confirmed" : "Razorpay test order created"}</p><p className="mt-1 break-all text-xs opacity-70">{checkout.paymentOrder.id}</p>{checkout.status === "paid" && <p className="mt-2 text-xs">Payment verified, inventory reserved, and your purchase history was updated.</p>}{checkout.paymentOrder.simulated && <p className="mt-2 text-xs">Safe simulation mode—add Razorpay test credentials to create a test-mode order.</p>}</div>
          )}
        </div>
      )}
    </aside>
  );
}

function RecommendationPanel({ recommendations, metrics, busy, onDecision }) {
  if (!recommendations.length && !metrics.impressions) return null;
  return (
    <section aria-labelledby="recommendations-heading" className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black tracking-[0.18em] text-violet-300">PHASE 3 · EXPLAINABLE UPSELL</p><h2 id="recommendations-heading" className="mt-2 text-xl font-extrabold">Complete your purchase</h2><p className="mt-1 text-sm text-slate-400">Compatible, in stock, and already checked against your remaining budget.</p></div>
        <div className="grid grid-cols-3 gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center"><Metric label="Shown" value={metrics.impressions} /><Metric label="Accepted" value={metrics.accepted} /><Metric label="Uplift" value={formatMoney(metrics.incrementalRevenue)} /></div>
      </div>
      {recommendations.length ? <div className="mt-5 grid gap-4 md:grid-cols-2">{recommendations.map(({ product, reason, projectedTotal }) => (
        <article key={product.id} className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
          <div className="flex justify-between gap-4"><div><p className="font-extrabold text-white">{product.name}</p><p className="mt-1 text-sm font-bold text-violet-300">+{formatMoney(product.price)}</p></div><span className="text-xs text-slate-500">New total<br/><strong className="text-slate-300">{formatMoney(projectedTotal)}</strong></span></div>
          <p className="mt-3 text-sm leading-6 text-slate-400">{reason}</p>
          <div className="mt-4 flex gap-2"><button disabled={busy} onClick={() => onDecision(product.id, "accepted")} className="rounded-lg bg-violet-400 px-3 py-2 text-sm font-extrabold text-violet-950 hover:bg-violet-300 disabled:opacity-50">Add recommended item</button><button disabled={busy} onClick={() => onDecision(product.id, "rejected")} className="rounded-lg px-3 py-2 text-sm font-bold text-slate-400 hover:bg-white/5">No thanks</button></div>
        </article>
      ))}</div> : <p className="mt-5 text-sm text-slate-500">No additional compatible item fits the remaining budget.</p>}
      {metrics.impressions > 0 && <p className="mt-4 text-xs text-slate-500">Measured acceptance rate: {(metrics.acceptanceRate * 100).toFixed(1)}%. Revenue uplift counts accepted items only.</p>}
    </section>
  );
}

function CampaignControlCentre() {
  const [opportunities, setOpportunities] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [campaign, setCampaign] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api("/api/campaigns/opportunities").then(({ opportunities: items }) => {
      setOpportunities(items);
      setSelectedProduct(items[0]?.product.id ?? "");
    }).catch((error) => setNotice(error.message));
  }, []);

  async function action(label, callback) {
    setBusy(true); setNotice("");
    try { setCampaign(await callback()); setNotice(label); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  function propose(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    action("Policy-compliant draft created. Human approval is still required.", () => api("/api/campaigns", {
      method: "POST",
      body: JSON.stringify({
        productId: selectedProduct,
        budget: Number(data.get("budget")),
        discountPercent: Number(data.get("discountPercent")),
        audience: "consented_cart_abandoners",
        channel: data.get("channel"),
        maxMessagesPerCustomer: 1
      })
    }));
  }

  return (
    <section aria-labelledby="campaign-heading" className="mt-10 overflow-hidden rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-400/10 via-slate-900/90 to-slate-950 shadow-2xl shadow-black/40">
      <div className="border-b border-white/10 p-6 md:p-8"><p className="text-xs font-black tracking-[0.2em] text-amber-300">PHASE 4 · AUTONOMOUS CAMPAIGN ORCHESTRATOR</p><h2 id="campaign-heading" className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Turn a measured revenue gap into a bounded campaign.</h2><p className="mt-3 max-w-3xl leading-7 text-slate-400">The orchestrator detects weak conversion, proposes a consented campaign, waits for merchant approval, and pauses itself when performance breaches stop-loss rules.</p></div>
      <div className="grid gap-6 p-6 md:p-8 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <h3 className="font-extrabold text-white">Detected opportunities</h3>
          <div className="mt-4 space-y-3">{opportunities.map((item) => (
            <button key={item.product.id} onClick={() => setSelectedProduct(item.product.id)} className={`w-full rounded-xl border p-4 text-left transition ${selectedProduct === item.product.id ? "border-amber-300/50 bg-amber-300/10" : "border-white/10 bg-black/20 hover:border-white/20"}`}>
              <div className="flex justify-between gap-4"><strong>{item.product.name}</strong><span className="text-sm font-black text-amber-300">{formatMoney(item.estimatedRevenueGap)} gap</span></div>
              <p className="mt-2 text-xs text-slate-400">Conversion {(item.conversionRate * 100).toFixed(1)}% · Benchmark {(item.benchmarkConversionRate * 100).toFixed(1)}% · {item.evidence.views.toLocaleString("en-IN")} measured views</p>
            </button>
          ))}</div>
          <form onSubmit={propose} className="mt-5 grid grid-cols-2 gap-3">
            <label className="grid gap-2 text-xs font-bold text-slate-400">Campaign budget (₹)<input name="budget" type="number" min="1" max="5000" defaultValue="1500" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-base text-white" /></label>
            <label className="grid gap-2 text-xs font-bold text-slate-400">Discount (%)<input name="discountPercent" type="number" min="0" max="20" defaultValue="10" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-base text-white" /></label>
            <label className="col-span-2 grid gap-2 text-xs font-bold text-slate-400">Approved channel<select name="channel" defaultValue="email" className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2.5 text-base text-white"><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></label>
            <button disabled={!selectedProduct || busy} className="col-span-2 rounded-xl bg-amber-300 px-4 py-3 font-black text-amber-950 hover:bg-amber-200 disabled:opacity-50">Generate bounded proposal</button>
          </form>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
          {!campaign ? <div className="grid min-h-80 place-items-center text-center text-sm text-slate-500"><p>Select an evidence-backed opportunity and generate a campaign proposal.</p></div> : (
            <div>
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-slate-500">Campaign status</p><p className="mt-1 text-xl font-black capitalize text-white">{campaign.status.replaceAll("_", " ")}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${campaign.policyCheck.passed ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>Policy {campaign.policyCheck.passed ? "passed" : "blocked"}</span></div>
              <p className="mt-5 rounded-xl bg-white/5 p-4 text-sm leading-6 text-slate-300">{campaign.rationale}</p>
              <div className="mt-4"><p className="text-xs font-black uppercase tracking-widest text-slate-500">Generated message</p><p className="mt-2 rounded-xl border border-white/10 p-4 text-sm leading-6 text-slate-300">{campaign.message}</p></div>
              <dl className="mt-5 grid grid-cols-3 gap-3"><Metric label="Budget" value={formatMoney(campaign.budget)} /><Metric label="Discount" value={`${campaign.discountPercent}%`} /><Metric label="Frequency cap" value={`${campaign.maxMessagesPerCustomer}×`} /></dl>
              {campaign.status === "draft" && <button disabled={busy} onClick={() => action("Merchant approval recorded with timestamp.", () => api(`/api/campaigns/${campaign.id}/approve`, { method: "POST", body: JSON.stringify({ approvedBy: "merchant-demo" }) }))} className="mt-5 w-full rounded-xl bg-blue-500 px-4 py-3 font-black text-white hover:bg-blue-400">Approve as merchant</button>}
              {campaign.status === "approved" && <button disabled={busy} onClick={() => action("Campaign launched inside policy boundaries.", () => api(`/api/campaigns/${campaign.id}/launch`, { method: "POST", body: "{}" }))} className="mt-5 w-full rounded-xl bg-emerald-400 px-4 py-3 font-black text-emerald-950 hover:bg-emerald-300">Launch simulated campaign</button>}
              {campaign.status === "active" && <div className="mt-5 grid grid-cols-2 gap-3"><button disabled={busy} onClick={() => action("Healthy performance batch recorded.", () => api(`/api/campaigns/${campaign.id}/performance`, { method: "POST", body: JSON.stringify({ spend: 400, impressions: 1000, clicks: 120, conversions: 10, revenue: 12990 }) }))} className="rounded-xl bg-emerald-400 px-3 py-3 text-sm font-black text-emerald-950">Simulate healthy batch</button><button disabled={busy} onClick={() => action("Poor batch recorded; stop-loss evaluated.", () => api(`/api/campaigns/${campaign.id}/performance`, { method: "POST", body: JSON.stringify({ spend: 600, impressions: 1000, clicks: 10, conversions: 0, revenue: 0 }) }))} className="rounded-xl bg-rose-400 px-3 py-3 text-sm font-black text-rose-950">Simulate poor batch</button></div>}
              {(campaign.performance.spend > 0 || campaign.stopReason) && <div className="mt-5 rounded-xl border border-white/10 p-4"><div className="grid grid-cols-3 gap-3"><Metric label="Spend" value={formatMoney(campaign.performance.spend)} /><Metric label="Revenue" value={formatMoney(campaign.performance.revenue)} /><Metric label="ROAS" value={`${campaign.report.roas.toFixed(2)}×`} /></div>{campaign.stopReason && <p className="mt-4 rounded-lg bg-rose-400/10 px-3 py-2 text-sm font-bold text-rose-200">{campaign.stopReason}</p>}</div>}
            </div>
          )}
          {notice && <p role="status" className="mt-4 text-sm text-amber-200">{notice}</p>}
        </div>
      </div>
    </section>
  );
}

function AgentOperations() {
  const [agentStatus, setAgentStatus] = useState(null);
  const [runs, setRuns] = useState([]);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const [status, history] = await Promise.all([api("/api/agents/status"), api("/api/agents/runs?limit=8")]);
        if (active) { setAgentStatus(status); setRuns(history.runs); }
      } catch { /* The main commerce UI remains available if observability is temporarily unavailable. */ }
    }
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return (
    <section aria-labelledby="agent-operations-heading" className="mb-7 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black tracking-[0.18em] text-cyan-300">LIVE LANGGRAPH RUNTIME</p><h2 id="agent-operations-heading" className="mt-2 text-xl font-black">Agent Operations</h2><p className="mt-1 text-sm text-slate-400">Every card below is a real graph run with node-level state transitions.</p></div>
        <div className="flex flex-wrap gap-2"><span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200">{agentStatus?.framework ?? "Connecting…"}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${agentStatus?.llmEnabled ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-400/10 text-slate-400"}`}>LLM {agentStatus?.llmEnabled ? `${agentStatus.model} enabled` : "optional · off"}</span></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{(agentStatus?.workflows ?? ["shopping", "recommendation", "checkout", "campaign"]).map((workflow) => <span key={workflow} className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-bold capitalize text-slate-300">{workflow} graph</span>)}</div>
      {!runs.length ? <p className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">No runs yet. Ask the shopping agent, add an item, approve checkout, or generate a campaign to watch agents execute.</p> : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">{runs.map((run) => (
          <article key={run.id} className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-slate-500">{run.workflow} workflow</p><p className="mt-1 text-sm font-bold text-white">Run {run.id.slice(0, 8)}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${run.status === "completed" ? "bg-emerald-400/10 text-emerald-300" : run.status === "failed" ? "bg-rose-400/10 text-rose-300" : "bg-amber-400/10 text-amber-300"}`}>{run.status}</span></div>
            <div className="mt-4 flex flex-wrap gap-2">{run.events.map((event) => <span key={event.id} title={JSON.stringify(event.details)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${event.status === "completed" ? "border-emerald-400/20 text-emerald-200" : event.status === "failed" ? "border-rose-400/20 text-rose-200" : "border-amber-400/20 text-amber-200"}`}>{event.agent} · {event.status}</span>)}</div>
            {run.llmUsed && <p className="mt-3 text-[11px] text-cyan-300">Optional LLM response node enabled; financial tools remained deterministic.</p>}
          </article>
        ))}</div>
      )}
    </section>
  );
}

function AgentTrace() {
  const [run, setRun] = useState(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => { try { const body = await api("/api/agents/runs?limit=1"); if (active) setRun(body.runs[0]); } catch { /* optional observability */ } };
    refresh(); const timer = window.setInterval(refresh, 1200);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  if (!run) return null;
  return <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-black text-cyan-200">Agent activity</h2><span className="text-xs text-slate-500">{run.workflow} · {run.status}</span></div><div className="mt-3 flex flex-wrap gap-2">{run.events.map((event) => <span key={event.id} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${event.status === "completed" ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200"}`}>{event.agent.replaceAll("-", " ")} {event.status === "completed" ? "✓" : "…"}</span>)}</div></section>;
}

function MerchantControls() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState({ maxCustomerSpend: 2000, maxDiscountPercent: 20, approvalThreshold: 1000, prohibitedProductIds: [], shippingPolicy: "", returnPolicy: "" });
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({ id: "", name: "", description: "", category: "skincare", price: 0, inventory: 0, shippingDays: 2, returnable: true, tags: "", complements: "" });
  const emptyDraft = { id: "", name: "", description: "", category: "skincare", price: 0, inventory: 0, shippingDays: 2, returnable: true, tags: "", complements: "" };
  const productFields = [
    { field: "id", label: "Product ID", hint: "Unique code used by agents", example: "fruit-cream-01", required: true },
    { field: "name", label: "Product name", hint: "Name customers will see", example: "Fruit Hydration Cream", required: true },
    { field: "description", label: "Description", hint: "Explain what the product is used for", example: "Daily moisturising cream for dry skin", required: true },
    { field: "category", label: "Category", hint: "Main catalogue category", example: "skincare", required: true },
    { field: "price", label: "Price (₹)", hint: "Selling price in Indian rupees", example: "799", type: "number", min: 0 },
    { field: "inventory", label: "Available stock", hint: "Number of units currently available", example: "30", type: "number", min: 0 },
    { field: "shippingDays", label: "Shipping time (days)", hint: "Expected dispatch/delivery duration", example: "3", type: "number", min: 0 },
    { field: "tags", label: "Search tags", hint: "Separate tags with commas", example: "hydrating, daily-use, dry-skin" },
    { field: "complements", label: "Recommended companion product IDs", hint: "Comma-separated IDs used for cross-selling", example: "serum-01, face-mask-01" }
  ];
  const reload = useCallback(async () => { const [catalogue, guardrails] = await Promise.all([api("/api/products"), api("/api/merchant/settings")]); setProducts(catalogue.products); setSettings(guardrails); }, []);
  useEffect(() => { reload().catch((error) => setNotice(error.message)); }, [reload]);
  async function saveProduct(event) {
    event.preventDefault();
    const product = { ...draft, price: Number(draft.price), inventory: Number(draft.inventory), shippingDays: Number(draft.shippingDays), currency: "INR", tags: draft.tags.split(",").map((v) => v.trim()).filter(Boolean), complements: draft.complements.split(",").map((v) => v.trim()).filter(Boolean) };
    try { await api("/api/products", { method: "POST", body: JSON.stringify(product) }); setNotice(`${product.name} saved to the authoritative catalogue.`); await reload(); } catch (error) { setNotice(error.message); }
  }
  async function deleteProduct(id) { try { await api(`/api/products/${id}`, { method: "DELETE" }); setNotice(`${id} removed from the catalogue.`); await reload(); } catch (error) { setNotice(error.message); } }
  async function importCsv(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const [header, ...rows] = (await file.text()).trim().split(/\r?\n/).map((line) => line.split(",").map((value) => value.trim()));
      const productsToImport = rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]]))).map((item) => ({ ...item, price: Number(item.price), inventory: Number(item.inventory), shippingDays: Number(item.shippingDays), returnable: item.returnable === "true", currency: item.currency || "INR", tags: item.tags ? item.tags.split("|") : [], complements: item.complements ? item.complements.split("|") : [] }));
      const result = await api("/api/products/import", { method: "POST", body: JSON.stringify({ products: productsToImport }) }); setNotice(`Imported ${result.imported.length} products; ${result.errors.length} rows rejected with reasons.`); await reload();
    } catch (error) { setNotice(error.message); }
  }
  async function saveSettings(event) { event.preventDefault(); try { await api("/api/merchant/settings", { method: "PUT", body: JSON.stringify({ ...settings, maxCustomerSpend: Number(settings.maxCustomerSpend), maxDiscountPercent: Number(settings.maxDiscountPercent), approvalThreshold: Number(settings.approvalThreshold) }) }); setNotice("Merchant guardrails saved in PostgreSQL."); } catch (error) { setNotice(error.message); } }
  return <section className="mb-7 grid gap-6 lg:grid-cols-2">
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5"><p className="text-xs font-black tracking-widest text-amber-300">CATALOGUE MANAGEMENT</p><h2 className="mt-2 text-xl font-black">Products and inventory</h2><label className="mt-3 block cursor-pointer rounded-lg border border-dashed border-amber-300/30 px-3 py-2 text-center text-xs font-bold text-amber-200">Import catalogue CSV<input type="file" accept=".csv,text/csv" onChange={importCsv} className="sr-only" /></label><div className="mt-4 max-h-48 space-y-2 overflow-auto">{products.map((product) => <div key={product.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm"><span>{product.name}</span><span className="ml-auto text-slate-400">{formatMoney(product.price)} · {product.inventory} stock</span><button onClick={() => setDraft({ ...product, tags: product.tags.join(","), complements: product.complements.join(",") })} className="text-xs font-bold text-blue-300">Edit</button><button onClick={() => deleteProduct(product.id)} className="text-xs font-bold text-rose-300">Delete</button></div>)}</div><div className="mt-6 flex items-center justify-between"><div><h3 className="font-black text-white">{products.some(({ id }) => id === draft.id) ? "Edit product" : "Add a product"}</h3><p className="mt-1 text-xs text-slate-500">Fields marked * are required. Prices and stock become authoritative agent data.</p></div>{draft.id && <button onClick={() => setDraft(emptyDraft)} className="text-xs font-bold text-slate-400 hover:text-white">Clear form</button>}</div><form onSubmit={saveProduct} className="mt-4 grid gap-4 sm:grid-cols-2">{productFields.map(({ field, label, hint, example, type = "text", min, required }) => <label key={field} className={`grid content-start gap-1.5 text-xs font-bold text-slate-300 ${field === "description" || field === "complements" ? "sm:col-span-2" : ""}`}><span>{label}{required && <span className="text-rose-300"> *</span>}</span><input required={required} type={type} min={min} value={draft[field]} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} placeholder={`Example: ${example}`} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-normal text-white placeholder:text-slate-600 focus:border-amber-300 focus:outline-none" /><span className="font-normal leading-4 text-slate-500">{hint}</span></label>)}<label className="flex items-center gap-2 self-center text-sm"><input type="checkbox" checked={draft.returnable} onChange={(event) => setDraft((current) => ({ ...current, returnable: event.target.checked }))} /> Returnable to merchant</label><button className="rounded-lg bg-amber-300 px-3 py-3 font-black text-amber-950">{products.some(({ id }) => id === draft.id) ? "Save product changes" : "Add product to catalogue"}</button></form></div>
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5"><p className="text-xs font-black tracking-widest text-rose-300">MERCHANT GUARDRAILS</p><h2 className="mt-2 text-xl font-black">Agent permissions</h2><form onSubmit={saveSettings} className="mt-4 space-y-3">{[["maxCustomerSpend","Maximum customer spend"],["maxDiscountPercent","Maximum discount %"],["approvalThreshold","Human approval above ₹"]].map(([field,label]) => <label key={field} className="grid gap-1 text-xs font-bold text-slate-400">{label}<input type="number" value={settings[field]} onChange={(event) => setSettings((current) => ({ ...current, [field]: event.target.value }))} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-base text-white" /></label>)}{[["shippingPolicy","Shipping policy"],["returnPolicy","Return policy"]].map(([field,label]) => <label key={field} className="grid gap-1 text-xs font-bold text-slate-400">{label}<input value={settings[field] ?? ""} onChange={(event) => setSettings((current) => ({ ...current, [field]: event.target.value }))} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-base text-white" /></label>)}<label className="grid gap-1 text-xs font-bold text-slate-400">Prohibited product IDs<input value={(settings.prohibitedProductIds ?? []).join(", ")} onChange={(event) => setSettings((current) => ({ ...current, prohibitedProductIds: event.target.value.split(",").map((v) => v.trim()).filter(Boolean) }))} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-base text-white" /></label><button className="w-full rounded-lg bg-rose-300 px-3 py-2 font-black text-rose-950">Save guardrails</button></form>{notice && <p className="mt-3 text-sm text-amber-200">{notice}</p>}</div>
  </section>;
}

export default function App() {
  const page = getPageFromPath(window.location.pathname);
  const [filters, setFilters] = useState({ query: "", maxPrice: "", inStock: true });
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("Loading catalogue…");
  const [session, setSession] = useState(null);
  const [message, setMessage] = useState("I need a skincare gift under ₹2,000");
  const [conversation, setConversation] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [rememberedContext, setRememberedContext] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [metrics, setMetrics] = useState({ impressions: 0, accepted: 0, rejected: 0, incrementalRevenue: 0, acceptanceRate: 0 });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState(null);
  const initialized = useRef(false);

  const search = useCallback(async (nextFilters) => {
    setStatus("Searching authoritative records…");
    try {
      const body = await api(`/api/products?${buildSearchParams(nextFilters)}`);
      setProducts(body.products); setStatus(`${body.count} verified product${body.count === 1 ? "" : "s"}`);
    } catch (error) { setProducts([]); setStatus(error.message); }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (page !== "customer") return;
    search(filters);
    (async () => {
      const demoCustomer = { id: window.localStorage.getItem("customerId") ?? crypto.randomUUID(), name: "Demo Customer", email: `demo-${Date.now()}@example.test`, preferences: { category: "skincare" } };
      window.localStorage.setItem("customerId", demoCustomer.id); setCustomer(demoCustomer);
      try { await api("/api/customers", { method: "POST", body: JSON.stringify(demoCustomer) }); } catch { /* memory mode remains supported */ }
      const storedSessionId = window.localStorage.getItem("shoppingSessionId");
      if (storedSessionId) {
        try { const restored = await api(`/api/sessions/${storedSessionId}`); setSession(restored); setConversation(restored.messages); setRememberedContext(restored.shoppingContext); await loadRecommendations(restored.id); return; } catch { window.localStorage.removeItem("shoppingSessionId"); }
      }
      const created = await api("/api/sessions", { method: "POST", body: JSON.stringify({ spendingLimit: 2000, customerId: demoCustomer.id, customerName: demoCustomer.name, preferences: demoCustomer.preferences }) });
      window.localStorage.setItem("shoppingSessionId", created.id); setSession(created); await loadRecommendations(created.id);
    })().catch((error) => setNotice(error.message));
  }, [page, search]);

  async function sendMessage(event) {
    event.preventDefault();
    if (!message.trim() || !session || busy) return;
    const userMessage = message.trim();
    setConversation((current) => [...current, { role: "user", content: userMessage }]);
    setMessage(""); setBusy(true); setNotice("");
    try {
      const body = await api(`/api/sessions/${session.id}/messages`, { method: "POST", body: JSON.stringify({ message: userMessage }) });
      setConversation((current) => [...current, { role: "assistant", content: body.reply }]); setSuggestions(body.suggestions); setRememberedContext(body.interpreted);
      if (body.action?.type?.startsWith("cart.")) { await refreshSession(); await loadRecommendations(); }
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }

  async function refreshSession() {
    const current = await api(`/api/sessions/${session.id}`);
    setSession(current);
    return current;
  }

  async function loadRecommendations(targetSessionId = session.id) {
    const recommendationBody = await api(`/api/sessions/${targetSessionId}/recommendations`);
    const metricBody = await api("/api/recommendations/metrics");
    setRecommendations(recommendationBody.recommendations);
    setMetrics(metricBody);
  }

  async function addToCart(product) {
    setBusy(true); setNotice("");
    try { await api(`/api/sessions/${session.id}/cart`, { method: "POST", body: JSON.stringify({ productId: product.id, quantity: 1 }) }); await refreshSession(); await loadRecommendations(); setNotice(`${product.name} added using verified price and stock.`); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }

  async function removeFromCart(productId) {
    setBusy(true); setNotice("");
    try { await api(`/api/sessions/${session.id}/cart/${productId}`, { method: "DELETE" }); await refreshSession(); await loadRecommendations(); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }

  async function updateQuantity(productId, quantity) {
    setBusy(true); setNotice("");
    try { await api(`/api/sessions/${session.id}/cart`, { method: "POST", body: JSON.stringify({ productId, quantity, quantityMode: "set" }) }); await refreshSession(); await loadRecommendations(); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }

  async function decideRecommendation(productId, decision) {
    setBusy(true); setNotice("");
    try {
      const result = await api(`/api/sessions/${session.id}/recommendations/${productId}`, { method: "POST", body: JSON.stringify({ decision }) });
      await refreshSession();
      setMetrics(result.metrics);
      setRecommendations((current) => current.filter(({ product }) => product.id !== productId));
      setNotice(decision === "accepted" ? `Recommended item added. Verified cart total is now ${formatMoney(result.cart.total)}.` : "Recommendation dismissed and recorded.");
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }

  async function checkout() {
    setBusy(true); setNotice("");
    try {
      const body = await api(`/api/sessions/${session.id}/checkout`, { method: "POST", body: JSON.stringify({ approvedTotal: session.cart.total }) });
      await refreshSession();
      if (body.paymentOrder.simulated) {
        setNotice("Test order safely simulated. Configure Razorpay test credentials to open the payment gateway.");
      } else {
        const RazorpayCheckout = await loadRazorpayCheckout();
        const options = buildRazorpayOptions(
          body.paymentOrder,
          async (payment) => {
            setBusy(true); setNotice("Verifying payment signature…");
            try {
              await api(`/api/sessions/${session.id}/payment/verify`, { method: "POST", body: JSON.stringify(payment) });
              await refreshSession(); setNotice("Payment verified securely. Order is confirmed.");
            } catch (error) { setNotice(`Payment could not be verified: ${error.message}`); }
            finally { setBusy(false); }
          },
          () => setNotice("Razorpay Checkout was closed. No payment status was changed.")
        );
        new RazorpayCheckout(options).open();
        setNotice("Razorpay test checkout opened. Use Razorpay test payment details only.");
      }
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }

  function update(event) {
    const { name, type, checked, value } = event.target;
    setFilters((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  return (
    <div className="min-h-screen bg-[#090b10] text-slate-50 selection:bg-blue-500/40">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(55,85,150,.45),transparent_34rem)]" />
      <div className="relative mx-auto w-[min(1180px,calc(100%-36px))]">
        <nav aria-label="Product areas" className="flex items-center justify-between border-b border-white/10 py-4">
          <a href="/customer" className="text-sm font-black tracking-[0.15em] text-blue-300">AGENTIC COMMERCE</a>
          <div className="flex rounded-xl border border-white/10 bg-slate-900/80 p-1">
            <a href="/customer" aria-current={page === "customer" ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${page === "customer" ? "bg-blue-500 text-white" : "text-slate-400 hover:text-white"}`}>Customer Store</a>
            <a href="/merchant" aria-current={page === "merchant" ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${page === "merchant" ? "bg-amber-300 text-amber-950" : "text-slate-400 hover:text-white"}`}>Merchant Console</a>
          </div>
        </nav>
        <header className="pb-12 pt-14 md:pt-20">
          <div className="flex flex-wrap items-center gap-3"><p className={`text-xs font-black tracking-[0.2em] ${page === "customer" ? "text-blue-400" : "text-amber-300"}`}>RAZORPAY BUILDATHON</p><span className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold text-slate-300">{page === "customer" ? "CUSTOMER EXPERIENCE" : "MERCHANT OPERATIONS"}</span></div>
          <h1 className="mt-4 max-w-5xl text-5xl font-black leading-[.94] tracking-[-.055em] sm:text-7xl md:text-8xl">{page === "customer" ? "Shop through a guarded agent." : "Operate growth with visible agents."}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-400">{page === "customer" ? "Discover verified products, receive budget-safe recommendations, manage your cart, and complete a protected Razorpay test checkout." : "Inspect LangGraph execution, identify revenue gaps, approve bounded campaigns, monitor performance, and verify automatic stop-loss behavior."}</p>
        </header>
        {page === "merchant" && <><AgentOperations /><MerchantControls /></>}
        {page === "customer" && notice && <div role="status" className="mb-5 rounded-xl border border-blue-400/20 bg-blue-400/10 px-4 py-3 text-sm text-blue-100">{notice}</div>}
        {page === "customer" && <main className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <section aria-labelledby="agent-heading" className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/30 backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 id="agent-heading" className="font-extrabold">Shopping agent</h2><p className="text-xs text-slate-500">{customer?.name ?? "Customer"} · bounded by a {formatMoney(session?.spendingLimit ?? 2000)} limit</p></div><span className="text-xs font-bold text-emerald-400">● Catalogue connected</span></div>
              <div className="min-h-40 space-y-3 p-5">
                {!conversation.length && <p className="max-w-lg rounded-2xl rounded-bl-sm bg-slate-800 px-4 py-3 text-sm leading-6 text-slate-300">Tell me what you need and your budget. I will only suggest verified, in-stock products.</p>}
                {conversation.map((entry, index) => <p key={index} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${entry.role === "user" ? "ml-auto rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-slate-800 text-slate-300"}`}>{entry.content}</p>)}
                {busy && <p className="w-fit rounded-2xl rounded-bl-sm bg-slate-800 px-4 py-3 text-sm text-slate-400">Agents are checking catalogue, stock and guardrails…</p>}
              </div>
              {rememberedContext && <div aria-label="Remembered preferences" className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-cyan-400/5 px-4 py-3"><span className="text-xs font-black text-cyan-300">REMEMBERING</span>{rememberedContext.category && <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">{rememberedContext.category}</span>}{rememberedContext.productType && <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">{rememberedContext.productType}</span>}{rememberedContext.useCase && <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">{rememberedContext.useCase.replace("-", " ")}</span>}{rememberedContext.maxPrice && <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">under {formatMoney(rememberedContext.maxPrice)}</span>}</div>}
              <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 pt-3">{["Show me something cheaper","Add the first product","Remove the item","Make quantity 2"].map((prompt) => <button key={prompt} onClick={() => setMessage(prompt)} className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:text-white">{prompt}</button>)}</div><form onSubmit={sendMessage} className="flex gap-3 p-4"><label className="sr-only" htmlFor="agent-message">Shopping request</label><input id="agent-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="I need a skincare gift under ₹2,000" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-400" /><button disabled={!session || busy} className="rounded-xl bg-blue-600 px-5 font-extrabold transition hover:bg-blue-500 disabled:opacity-50">{busy ? "Working…" : "Ask agent"}</button></form>
            </section>
            <AgentTrace />
            {suggestions.length > 0 && <section aria-labelledby="suggestions-heading"><div className="mb-4 flex items-center justify-between"><h2 id="suggestions-heading" className="text-xl font-extrabold">Agent suggestions</h2><span className="text-sm text-slate-500">Verified now</span></div><div className="grid gap-4 md:grid-cols-2">{suggestions.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} />)}</div></section>}
            <details className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <summary className="cursor-pointer font-extrabold text-slate-200">Browse the authoritative catalogue</summary>
              <form onSubmit={(event) => { event.preventDefault(); search(filters); }} className="mt-5 grid items-end gap-4 md:grid-cols-[2fr_1fr_auto_auto]"><label className="grid gap-2 text-xs font-bold text-slate-400">Search<input name="query" value={filters.query} onChange={update} placeholder="e.g. skincare gift" className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base font-normal text-white outline-none" /></label><label className="grid gap-2 text-xs font-bold text-slate-400">Maximum price (₹)<input name="maxPrice" value={filters.maxPrice} onChange={update} type="number" min="0" placeholder="2000" className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base font-normal text-white outline-none" /></label><label className="flex min-h-12 items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-300"><input name="inStock" checked={filters.inStock} onChange={update} type="checkbox" className="size-4 accent-blue-500" /> In stock</label><button className="min-h-12 rounded-xl border border-white/15 px-4 font-bold hover:bg-white/5">Search</button></form>
              <p className="pb-4 pt-6 text-sm text-slate-500">{status}</p><div className="grid gap-4 md:grid-cols-2">{products.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} />)}</div>
            </details>
          </div>
          <div className="space-y-5 lg:sticky lg:top-5 lg:self-start">
            <Cart session={session} busy={busy} onRemove={removeFromCart} onQuantity={updateQuantity} onCheckout={checkout} />
            <RecommendationPanel recommendations={recommendations} metrics={metrics} busy={busy} onDecision={decideRecommendation} />
          </div>
        </main>}
        {page === "merchant" && <CampaignControlCentre />}
        <footer className="flex flex-wrap justify-between gap-3 py-12 text-sm text-slate-600"><span>{page === "customer" ? "Verified catalogue · Guarded cart · Explainable recommendations" : "Observable LangGraph runs · Human approval · Automatic stop-loss"}</span><span>{page === "customer" ? "Razorpay test mode" : "Simulated campaign delivery"}</span></footer>
      </div>
    </div>
  );
}
