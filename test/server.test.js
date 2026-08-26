import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/server.js";

async function withServer(run) {
  const server = createApp();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("health endpoint reports readiness", () => withServer(async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "catalogue" });
}));

test("catalogue endpoint supports bounded product search", () => withServer(async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/products?q=skincare&maxPrice=1000&inStock=true`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.count >= 1);
  assert.ok(body.products.every((product) => product.price <= 1000 && product.inventory > 0));
}));

test("inventory endpoint rejects invalid quantities", () => withServer(async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/products/serum-01/inventory?quantity=0`);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /quantity/i);
}));
