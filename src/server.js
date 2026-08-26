import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, extname, join, normalize } from "node:path";
import { Catalogue, ValidationError } from "./catalogue.js";
import { seedProducts } from "./seed.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function staticFile(pathname, response) {
  const relative = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, "");
  if (relative.includes("..")) return false;
  try {
    const body = await readFile(join(publicDir, relative));
    response.writeHead(200, { "content-type": contentTypes[extname(relative)] ?? "application/octet-stream" });
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

async function appShell(response) {
  try {
    const body = await readFile(join(publicDir, "index.html"));
    response.writeHead(200, { "content-type": contentTypes[".html"] });
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

export function createApp({ catalogue = new Catalogue(seedProducts) } = {}) {
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json(response, 200, { status: "ok", service: "catalogue" });
      }
      if (request.method === "GET" && url.pathname === "/api/products") {
        const rawMaxPrice = url.searchParams.get("maxPrice");
        const maxPrice = rawMaxPrice === null || rawMaxPrice === "" ? undefined : Number(rawMaxPrice);
        if (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
          throw new ValidationError("maxPrice must be a non-negative number");
        }
        const products = catalogue.search({
          query: url.searchParams.get("q") ?? "",
          maxPrice,
          category: url.searchParams.get("category") ?? undefined,
          inStock: url.searchParams.get("inStock") === "true"
        });
        return json(response, 200, { count: products.length, products });
      }
      const inventoryMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/inventory$/);
      if (request.method === "GET" && inventoryMatch) {
        const quantity = Number(url.searchParams.get("quantity") ?? "1");
        return json(response, 200, catalogue.checkInventory(decodeURIComponent(inventoryMatch[1]), quantity));
      }
      if (request.method === "GET" && url.pathname === "/api/audit") {
        return json(response, 200, { events: catalogue.auditLog() });
      }
      if (request.method === "GET" && await staticFile(url.pathname, response)) return;
      if (request.method === "GET" && !url.pathname.startsWith("/api/") && await appShell(response)) return;
      json(response, 404, { error: "Not found" });
    } catch (error) {
      if (error instanceof ValidationError) return json(response, 400, { error: error.message });
      console.error(error);
      json(response, 500, { error: "Internal server error" });
    }
  });
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => console.log(`Catalogue running at http://localhost:${port}`));
}
