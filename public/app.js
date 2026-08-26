const form = document.querySelector("#search-form");
const products = document.querySelector("#products");
const resultCount = document.querySelector("#result-count");

function money(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function card(product) {
  const article = document.createElement("article");
  const tags = product.tags.map((tag) => `<span>${tag}</span>`).join("");
  article.innerHTML = `
    <div class="card-top"><p>${product.category}</p><strong>${money(product.price)}</strong></div>
    <h2>${product.name}</h2><p>${product.description}</p>
    <div class="tags">${tags}</div>
    <dl><div><dt>Inventory</dt><dd>${product.inventory}</dd></div><div><dt>Ships in</dt><dd>${product.shippingDays} days</dd></div><div><dt>Returnable</dt><dd>${product.returnable ? "Yes" : "No"}</dd></div></dl>`;
  return article;
}

async function search() {
  const params = new URLSearchParams();
  const query = document.querySelector("#query").value.trim();
  const maxPrice = document.querySelector("#max-price").value;
  if (query) params.set("q", query);
  if (maxPrice) params.set("maxPrice", maxPrice);
  params.set("inStock", document.querySelector("#in-stock").checked);
  resultCount.textContent = "Searching authoritative records…";
  try {
    const response = await fetch(`/api/products?${params}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    products.replaceChildren(...body.products.map(card));
    resultCount.textContent = `${body.count} verified product${body.count === 1 ? "" : "s"}`;
  } catch (error) {
    products.replaceChildren();
    resultCount.textContent = error.message;
  }
}

form.addEventListener("submit", (event) => { event.preventDefault(); search(); });
search();
