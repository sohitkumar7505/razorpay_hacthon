import test from "node:test";
import assert from "node:assert/strict";
import { Catalogue, ValidationError } from "../src/catalogue.js";

const products = [
  {
    id: "serum-01",
    name: "Vitamin C Face Serum",
    description: "Brightening skincare serum for gifting",
    category: "skincare",
    price: 799,
    currency: "INR",
    inventory: 12,
    tags: ["gift", "brightening"],
    shippingDays: 2,
    returnable: true
  },
  {
    id: "cream-01",
    name: "Night Repair Cream",
    description: "Hydrating night moisturiser",
    category: "skincare",
    price: 1299,
    currency: "INR",
    inventory: 0,
    tags: ["hydrating"],
    shippingDays: 3,
    returnable: true
  }
];

test("imports valid products and exposes safe public records", () => {
  const catalogue = new Catalogue(products);
  assert.equal(catalogue.list().length, 2);
  assert.equal(catalogue.get("serum-01").price, 799);
});

test("rejects invalid or duplicate authoritative product data", () => {
  assert.throws(() => new Catalogue([{ ...products[0], price: -1 }]), ValidationError);
  assert.throws(() => new Catalogue([products[0], products[0]]), /Duplicate product id/);
});

test("search applies query, budget, category and stock constraints", () => {
  const catalogue = new Catalogue(products);
  const result = catalogue.search({
    query: "gift serum",
    maxPrice: 1000,
    category: "skincare",
    inStock: true
  });
  assert.deepEqual(result.map((product) => product.id), ["serum-01"]);
});

test("inventory check is authoritative and never guesses availability", () => {
  const catalogue = new Catalogue(products);
  assert.deepEqual(catalogue.checkInventory("serum-01", 2), {
    productId: "serum-01",
    requested: 2,
    available: 12,
    canFulfil: true
  });
  assert.equal(catalogue.checkInventory("cream-01", 1).canFulfil, false);
  assert.throws(() => catalogue.checkInventory("missing", 1), /Product not found/);
});

test("records a reconstructable audit trail for catalogue actions", () => {
  const catalogue = new Catalogue(products);
  catalogue.search({ query: "serum" });
  catalogue.checkInventory("serum-01", 1);
  const audit = catalogue.auditLog();
  assert.deepEqual(audit.map((entry) => entry.action), ["catalogue.search", "inventory.check"]);
  assert.ok(audit.every((entry) => entry.id && entry.timestamp && entry.details));
});
