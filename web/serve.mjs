// Zero-dependency static file server for local preview and smoke tests.
// Serves the repository root so the page at /web/ can fetch ../evidence/*.json.
//
//   node web/serve.mjs [port]   # default 8080, serving repo root
//
// Read-only: GET/HEAD only, path-traversal blocked, no write endpoints.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname, resolve, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, ".."); // repository root
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end("method not allowed");
      return;
    }
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/") path = "/web/index.html";
    const full = normalize(join(ROOT, path));
    if (!full.startsWith(ROOT + sep)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const info = await stat(full);
    const file = info.isDirectory() ? join(full, "index.html") : full;
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}/  (page: /web/index.html)`);
});
