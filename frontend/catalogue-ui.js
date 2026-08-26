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
