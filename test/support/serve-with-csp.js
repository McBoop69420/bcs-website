/**
 * Serves the site locally with the production Content Security Policy.
 *
 * Production pages pass through the Cloudflare Worker, which sends a strict CSP
 * (no inline event handlers, no style attributes). Staging and `npx serve` send
 * a looser policy or none, so CSP breakage only shows up after shipping. This
 * reads the CSP straight out of cloudflare/worker.js so local checks match
 * www.bluegrasscybersecurity.com.
 *
 *   node test/support/serve-with-csp.js [port]   (default 8002)
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const port = Number(process.argv[2]) || 8002;

const workerSource = await readFile(join(root, "cloudflare", "worker.js"), "utf8");
const csp = workerSource.match(/const CSP = `([^`]+)`/)?.[1];
if (!csp) throw new Error("Could not find the CSP constant in cloudflare/worker.js");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".xml": "application/xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

async function findFile(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const base = join(root, clean);
  if (!base.startsWith(root)) return null;
  // Same lookups as GitHub Pages: exact file, then pretty URL, then index.html.
  for (const candidate of [base, `${base}.html`, join(base, "index.html")]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${port}`);
  const file = await findFile(pathname);
  const status = file ? 200 : 404;
  const path = file || join(root, "404.html");
  res.writeHead(status, {
    "content-type": TYPES[extname(path)] || "application/octet-stream",
    "content-security-policy": csp,
    "cache-control": "no-store",
  });
  res.end(await readFile(path));
}).listen(port, () => {
  console.log(`Serving ${root} with the production CSP at http://localhost:${port}`);
});
