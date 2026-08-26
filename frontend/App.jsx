import { useCallback, useEffect, useState } from "react";
import { buildSearchParams, formatMoney } from "./catalogue-ui.js";

function ProductCard({ product }) {
  return (
    <article className="group rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/80 to-slate-950 p-6 shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-blue-400/40">
      <div className="flex items-start justify-between gap-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        <span>{product.category}</span>
        <strong className="text-lg tracking-normal text-blue-300">{formatMoney(product.price)}</strong>
      </div>
      <h2 className="mt-5 text-xl font-bold tracking-tight text-white">{product.name}</h2>
      <p className="mt-3 min-h-12 leading-6 text-slate-400">{product.description}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {product.tags.map((tag) => <span key={tag} className="rounded-full bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-200">{tag}</span>)}
      </div>
      <dl className="mt-6 grid grid-cols-3 border-t border-white/10 pt-5">
        <Metric label="Inventory" value={product.inventory} />
        <Metric label="Ships in" value={`${product.shippingDays} days`} />
        <Metric label="Returnable" value={product.returnable ? "Yes" : "No"} />
      </dl>
    </article>
  );
}

function Metric({ label, value }) {
  return <div><dt className="text-[11px] text-slate-500">{label}</dt><dd className="mt-1 text-sm font-bold text-slate-200">{value}</dd></div>;
}

export default function App() {
  const [filters, setFilters] = useState({ query: "", maxPrice: "", inStock: true });
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("Loading catalogue…");

  const search = useCallback(async (nextFilters) => {
    setStatus("Searching authoritative records…");
    try {
      const response = await fetch(`/api/products?${buildSearchParams(nextFilters)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Catalogue search failed");
      setProducts(body.products);
      setStatus(`${body.count} verified product${body.count === 1 ? "" : "s"}`);
    } catch (error) {
      setProducts([]);
      setStatus(error.message);
    }
  }, []);

  useEffect(() => { search(filters); }, []); // Initial catalogue load only.

  function update(event) {
    const { name, type, checked, value } = event.target;
    setFilters((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  return (
    <div className="min-h-screen bg-[#090b10] text-slate-50 selection:bg-blue-500/40">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(55,85,150,.45),transparent_34rem)]" />
      <div className="relative mx-auto w-[min(1100px,calc(100%-36px))]">
        <header className="pb-12 pt-14 md:pt-20">
          <p className="text-xs font-black tracking-[0.2em] text-blue-400">RAZORPAY BUILDATHON · PHASE 1</p>
          <h1 className="mt-4 max-w-4xl text-5xl font-black leading-[.94] tracking-[-.055em] sm:text-7xl md:text-8xl">A catalogue agents can trust.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">Search authoritative merchant data. Prices, inventory and policies come from guarded APIs—not an AI guess.</p>
        </header>

        <main>
          <form onSubmit={(event) => { event.preventDefault(); search(filters); }} className="grid items-end gap-4 rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/40 backdrop-blur md:grid-cols-[2fr_1fr_auto_auto]">
            <label className="grid gap-2 text-xs font-bold text-slate-400">What are you looking for?
              <input name="query" value={filters.query} onChange={update} placeholder="e.g. skincare gift" className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base font-normal text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20" />
            </label>
            <label className="grid gap-2 text-xs font-bold text-slate-400">Maximum price (₹)
              <input name="maxPrice" value={filters.maxPrice} onChange={update} type="number" min="0" placeholder="2000" className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base font-normal text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20" />
            </label>
            <label className="flex min-h-12 items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-300">
              <input name="inStock" checked={filters.inStock} onChange={update} type="checkbox" className="size-4 accent-blue-500" /> In stock only
            </label>
            <button type="submit" className="min-h-12 rounded-xl bg-blue-600 px-5 font-extrabold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-950">Search catalogue</button>
          </form>

          <div className="flex justify-between px-0.5 pb-4 pt-7 text-sm text-slate-400"><span aria-live="polite">{status}</span><span className="font-semibold text-emerald-400">● API live</span></div>
          {products.length > 0 ? (
            <section aria-label="Catalogue products" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => <ProductCard key={product.id} product={product} />)}
            </section>
          ) : status.startsWith("0 ") ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-slate-400">No verified products match these constraints.</div>
          ) : null}
        </main>
        <footer className="py-12 text-sm text-slate-600">Every search and inventory check is recorded in the audit trail.</footer>
      </div>
    </div>
  );
}
