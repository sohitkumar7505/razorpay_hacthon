import { useCallback, useEffect, useRef, useState } from "react";
import { buildSearchParams, formatMoney } from "./catalogue-ui.js";

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: options.body ? { "content-type": "application/json", ...options.headers } : options.headers });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

function Metric({ label, value }) {
  return <div><dt className="text-[11px] text-slate-500">{label}</dt><dd className="mt-1 text-sm font-bold text-slate-200">{value}</dd></div>;
}

function ProductCard({ product, onAdd }) {
  return (
    <article className="group rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/80 to-slate-950 p-5 shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-blue-400/40">
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

function Cart({ session, busy, onRemove, onCheckout }) {
  const cart = session?.cart ?? { items: [], total: 0 };
  const checkout = session?.checkout;
  return (
    <aside className="sticky top-5 rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold">Guarded cart</h2><span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300">Limit {formatMoney(session?.spendingLimit ?? 0)}</span></div>
      {!cart.items.length ? <p className="py-8 text-center text-sm text-slate-500">Your cart is empty.</p> : (
        <div className="mt-5 space-y-4">
          {cart.items.map((item) => <div key={item.productId} className="flex items-start justify-between gap-3 border-b border-white/10 pb-4"><div><p className="font-bold text-slate-200">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.quantity} × {formatMoney(item.unitPrice)}</p></div>{!checkout && <button onClick={() => onRemove(item.productId)} aria-label={`Remove ${item.name}`} className="text-xs font-bold text-rose-300 hover:text-rose-200">Remove</button>}</div>)}
          <div className="flex items-center justify-between pt-1"><span className="text-sm text-slate-400">Verified total</span><strong className="text-2xl text-white">{formatMoney(cart.total)}</strong></div>
          {!checkout ? <button disabled={busy} onClick={onCheckout} className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-extrabold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50">Approve {formatMoney(cart.total)} & create test order</button> : (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200"><p className="font-extrabold">{checkout.status === "paid" ? "Payment confirmed" : "Test order created"}</p><p className="mt-1 break-all text-xs opacity-70">{checkout.paymentOrder.id}</p>{checkout.paymentOrder.simulated && <p className="mt-2 text-xs">Safe simulation mode—add Razorpay test credentials to create a test-mode order.</p>}</div>
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

export default function App() {
  const [filters, setFilters] = useState({ query: "", maxPrice: "", inStock: true });
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("Loading catalogue…");
  const [session, setSession] = useState(null);
  const [message, setMessage] = useState("I need a skincare gift under ₹2,000");
  const [conversation, setConversation] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [metrics, setMetrics] = useState({ impressions: 0, accepted: 0, rejected: 0, incrementalRevenue: 0, acceptanceRate: 0 });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
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
    search(filters);
    api("/api/sessions", { method: "POST", body: JSON.stringify({ spendingLimit: 2000 }) }).then(setSession).catch((error) => setNotice(error.message));
  }, [search]);

  async function sendMessage(event) {
    event.preventDefault();
    if (!message.trim() || !session || busy) return;
    const userMessage = message.trim();
    setConversation((current) => [...current, { role: "user", content: userMessage }]);
    setMessage(""); setBusy(true); setNotice("");
    try {
      const body = await api(`/api/sessions/${session.id}/messages`, { method: "POST", body: JSON.stringify({ message: userMessage }) });
      setConversation((current) => [...current, { role: "assistant", content: body.reply }]); setSuggestions(body.suggestions);
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }

  async function refreshSession() {
    const current = await api(`/api/sessions/${session.id}`);
    setSession(current);
    return current;
  }

  async function loadRecommendations() {
    const recommendationBody = await api(`/api/sessions/${session.id}/recommendations`);
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
      await refreshSession(); setNotice(body.paymentOrder.simulated ? "Test order safely simulated. Configure Razorpay test credentials for a real test order." : "Razorpay test order created.");
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
        <header className="pb-12 pt-14 md:pt-20">
          <div className="flex flex-wrap items-center gap-3"><p className="text-xs font-black tracking-[0.2em] text-blue-400">RAZORPAY BUILDATHON</p><span className="rounded-full border border-violet-400/30 px-3 py-1 text-[11px] font-bold text-violet-200">PHASE 3 · REVENUE-AWARE COMMERCE</span></div>
          <h1 className="mt-4 max-w-4xl text-5xl font-black leading-[.94] tracking-[-.055em] sm:text-7xl md:text-8xl">Shop through a guarded agent.</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-400">Describe what you need. The agent interprets constraints, searches verified merchant records, and creates a test order only after you approve the exact total.</p>
        </header>
        {notice && <div role="status" className="mb-5 rounded-xl border border-blue-400/20 bg-blue-400/10 px-4 py-3 text-sm text-blue-100">{notice}</div>}
        <main className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <section aria-labelledby="agent-heading" className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/30 backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 id="agent-heading" className="font-extrabold">Shopping agent</h2><p className="text-xs text-slate-500">Bounded by a {formatMoney(session?.spendingLimit ?? 2000)} spending limit</p></div><span className="text-xs font-bold text-emerald-400">● Catalogue connected</span></div>
              <div className="min-h-40 space-y-3 p-5">
                {!conversation.length && <p className="max-w-lg rounded-2xl rounded-bl-sm bg-slate-800 px-4 py-3 text-sm leading-6 text-slate-300">Tell me what you need and your budget. I will only suggest verified, in-stock products.</p>}
                {conversation.map((entry, index) => <p key={index} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${entry.role === "user" ? "ml-auto rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-slate-800 text-slate-300"}`}>{entry.content}</p>)}
              </div>
              <form onSubmit={sendMessage} className="flex gap-3 border-t border-white/10 p-4"><label className="sr-only" htmlFor="agent-message">Shopping request</label><input id="agent-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="I need a skincare gift under ₹2,000" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-400" /><button disabled={!session || busy} className="rounded-xl bg-blue-600 px-5 font-extrabold transition hover:bg-blue-500 disabled:opacity-50">{busy ? "Working…" : "Ask agent"}</button></form>
            </section>
            {suggestions.length > 0 && <section aria-labelledby="suggestions-heading"><div className="mb-4 flex items-center justify-between"><h2 id="suggestions-heading" className="text-xl font-extrabold">Agent suggestions</h2><span className="text-sm text-slate-500">Verified now</span></div><div className="grid gap-4 md:grid-cols-2">{suggestions.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} />)}</div></section>}
            <RecommendationPanel recommendations={recommendations} metrics={metrics} busy={busy} onDecision={decideRecommendation} />
            <details className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <summary className="cursor-pointer font-extrabold text-slate-200">Browse the authoritative catalogue</summary>
              <form onSubmit={(event) => { event.preventDefault(); search(filters); }} className="mt-5 grid items-end gap-4 md:grid-cols-[2fr_1fr_auto_auto]"><label className="grid gap-2 text-xs font-bold text-slate-400">Search<input name="query" value={filters.query} onChange={update} placeholder="e.g. skincare gift" className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base font-normal text-white outline-none" /></label><label className="grid gap-2 text-xs font-bold text-slate-400">Maximum price (₹)<input name="maxPrice" value={filters.maxPrice} onChange={update} type="number" min="0" placeholder="2000" className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base font-normal text-white outline-none" /></label><label className="flex min-h-12 items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-300"><input name="inStock" checked={filters.inStock} onChange={update} type="checkbox" className="size-4 accent-blue-500" /> In stock</label><button className="min-h-12 rounded-xl border border-white/15 px-4 font-bold hover:bg-white/5">Search</button></form>
              <p className="pb-4 pt-6 text-sm text-slate-500">{status}</p><div className="grid gap-4 md:grid-cols-2">{products.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} />)}</div>
            </details>
          </div>
          <Cart session={session} busy={busy} onRemove={removeFromCart} onCheckout={checkout} />
        </main>
        <footer className="flex flex-wrap justify-between gap-3 py-12 text-sm text-slate-600"><span>Every search, cart action, approval and payment event is audited.</span><span>Razorpay test mode only · No live money movement</span></footer>
      </div>
    </div>
  );
}
