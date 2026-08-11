// Zero-dependency static file server for local preview and smoke tests.
// Serves the repository root so the page at /web/ can fetch ../evidence/*.json.
//
//   node web/serve.mjs [port]   # default 8080, serving repo root
//   node web/serve.mjs 0        # bind an OS-assigned free port
//
// On listen it prints a machine-parseable readiness line:
//   SERVE_LISTENING port=<n>
// Smoke harnesses wait for that line (and watch child error/exit) instead of
// polling a fixed port they do not own. When SMOKE_NONCE is set, GET
// /__smoke_nonce returns exactly that value, letting a caller prove the HTTP
// responder is this spawned process and not a stale server on the same port.
//
// Read-only: GET/HEAD only, path-traversal blocked, no write endpoints.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname, resolve, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, ".."); // repository root
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const SMOKE_NONCE = process.env.SMOKE_NONCE || "";

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
    // Checkout-identity probe: proves the responding process is THIS server, not a
    // stale listener that happened to already hold the port (REV-006).
    if (path === "/__smoke_nonce") {
      res.writeHead(SMOKE_NONCE ? 200 : 404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : SMOKE_NONCE);
      return;
    }
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
  const bound = server.address().port;
  // Machine-parseable readiness line consumed by the smoke harnesses.
  console.log(`SERVE_LISTENING port=${bound}`);
  console.log(`serving ${ROOT} at http://127.0.0.1:${bound}/  (page: /web/index.html)`);
});
