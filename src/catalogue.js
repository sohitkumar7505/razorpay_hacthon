import { randomUUID } from "node:crypto";

export class ValidationError extends Error {}

const requiredText = ["id", "name", "description", "category", "currency"];

function validateProduct(product) {
  for (const field of requiredText) {
    if (typeof product[field] !== "string" || !product[field].trim()) {
      throw new ValidationError(`${field} must be a non-empty string`);
    }
  }
  if (!Number.isFinite(product.price) || product.price < 0) {
    throw new ValidationError("price must be a non-negative number");
  }
  if (!Number.isInteger(product.inventory) || product.inventory < 0) {
    throw new ValidationError("inventory must be a non-negative integer");
  }
  if (!Number.isInteger(product.shippingDays) || product.shippingDays < 0) {
    throw new ValidationError("shippingDays must be a non-negative integer");
  }
  if (!Array.isArray(product.tags) || product.tags.some((tag) => typeof tag !== "string")) {
    throw new ValidationError("tags must be an array of strings");
  }
  if (typeof product.returnable !== "boolean") {
    throw new ValidationError("returnable must be a boolean");
  }
  return Object.freeze({ ...product, tags: Object.freeze([...product.tags]) });
}

function searchableText(product) {
  return [product.name, product.description, product.category, ...product.tags]
    .join(" ")
    .toLocaleLowerCase("en-IN");
}

export class Catalogue {
  #products = new Map();
  #audit = [];

  constructor(products = []) {
    for (const input of products) {
      const product = validateProduct(input);
      if (this.#products.has(product.id)) {
        throw new ValidationError(`Duplicate product id: ${product.id}`);
      }
      this.#products.set(product.id, product);
    }
  }

  #record(action, details) {
    this.#audit.push(Object.freeze({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      details: structuredClone(details)
    }));
  }

  list() {
    return [...this.#products.values()];
  }

  get(id) {
    const product = this.#products.get(id);
    if (!product) throw new ValidationError(`Product not found: ${id}`);
    return product;
  }

  search({ query = "", maxPrice, category, inStock = false } = {}) {
    const terms = String(query).trim().toLocaleLowerCase("en-IN").split(/\s+/).filter(Boolean);
    const normalizedCategory = category?.trim().toLocaleLowerCase("en-IN");
    const products = this.list()
      .filter((product) => !terms.length || terms.every((term) => searchableText(product).includes(term)))
      .filter((product) => maxPrice === undefined || product.price <= maxPrice)
      .filter((product) => !normalizedCategory || product.category.toLocaleLowerCase("en-IN") === normalizedCategory)
      .filter((product) => !inStock || product.inventory > 0)
      .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
    this.#record("catalogue.search", { query, maxPrice, category, inStock, resultCount: products.length });
    return products;
  }

  checkInventory(productId, quantity = 1) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ValidationError("quantity must be a positive integer");
    }
    const product = this.get(productId);
    const result = {
      productId,
      requested: quantity,
      available: product.inventory,
      canFulfil: product.inventory >= quantity
    };
    this.#record("inventory.check", result);
    return result;
  }

  auditLog() {
    return structuredClone(this.#audit);
  }
}
