import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchParams, formatMoney } from "../frontend/catalogue-ui.js";

test("builds bounded catalogue search parameters without empty values", () => {
  const params = buildSearchParams({ query: " skincare gift ", maxPrice: "2000", inStock: true });
  assert.equal(params.toString(), "q=skincare+gift&maxPrice=2000&inStock=true");
});

test("preserves an explicit all-inventory search", () => {
  const params = buildSearchParams({ query: "", maxPrice: "", inStock: false });
  assert.equal(params.toString(), "inStock=false");
});

test("formats catalogue prices as Indian rupees", () => {
  assert.equal(formatMoney(1899), "₹1,899");
});
