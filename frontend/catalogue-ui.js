export function buildSearchParams({ query = "", maxPrice = "", inStock = true }) {
  const params = new URLSearchParams();
  const trimmedQuery = query.trim();
  if (trimmedQuery) params.set("q", trimmedQuery);
  if (maxPrice !== "") params.set("maxPrice", String(maxPrice));
  params.set("inStock", String(Boolean(inStock)));
  return params;
}

export function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

export function buildRazorpayOptions(paymentOrder, handler, onDismiss) {
  return {
    key: paymentOrder.keyId,
    order_id: paymentOrder.id,
    amount: paymentOrder.amount,
    currency: paymentOrder.currency,
    name: "Guarded Commerce Demo",
    description: "Razorpay Buildathon test-mode purchase",
    handler,
    modal: { ondismiss: onDismiss },
    theme: { color: "#2563eb" }
  };
}

export function getPageFromPath(pathname) {
  return pathname === "/merchant" ? "merchant" : "customer";
}
