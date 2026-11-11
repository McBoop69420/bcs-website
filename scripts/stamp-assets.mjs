// Adds a content hash to every local CSS/JS link: css/site.css -> css/site.css?v=1a2b3c4d5e
//
// Pages lets browsers cache CSS and JS for 4 hours, so without this a deploy can show new
// HTML with an old stylesheet. The hash changes only when that file changes, so a page
// picks up the new file on the next load and unchanged files stay cached.
//
//   npm run stamp          rewrite the links after editing any css/ or js/ file
//   (npm test checks that no link is stale)
//
// Blog pages are skipped: the blog lives on main only (see AGENTS.md), and stamping them
// here would conflict with posts merged in from main.

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skipped = /^(blog\.html$|blog\/|drafts\/|node_modules\/|test\/|\.)/;
const assetLink = /\b(href|src)="((?!https?:|\/\/)[^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]*)?"/g;

async function htmlFiles(dir = root) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(root, full).split(sep).join("/");
    if (skipped.test(entry.isDirectory() ? `${rel}/` : rel)) continue;
    if (entry.isDirectory()) files.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith(".html")) files.push(rel);
  }
  return files;
}

const hashes = new Map();
async function hashOf(path) {
  if (!hashes.has(path)) {
    // Normalize line endings so Windows (CRLF) and other checkouts agree on the hash.
    const text = (await readFile(join(root, path), "utf8")).replace(/\r\n/g, "\n");
    hashes.set(path, createHash("sha256").update(text).digest("hex").slice(0, 10));
  }
  return hashes.get(path);
}

/** Returns the pages whose links were (or, with write: false, would be) changed. */
export async function stampAssets({ write = true } = {}) {
  const changed = [];
  for (const page of await htmlFiles()) {
    const html = await readFile(join(root, page), "utf8");
    const replacements = [];
    for (const match of html.matchAll(assetLink)) {
      const [, attr, url] = match;
      const target = url.startsWith("/") ? url.slice(1) : posix.join(posix.dirname(page), url);
      replacements.push(`${attr}="${url}?v=${await hashOf(target)}"`);
    }
    let i = 0;
    const stamped = html.replace(assetLink, () => replacements[i++]);
    if (stamped !== html) {
      changed.push(page);
      if (write) await writeFile(join(root, page), stamped);
    }
  }
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = await stampAssets();
  console.log(changed.length ? `Stamped ${changed.length} page(s):\n  ${changed.join("\n  ")}` : "All asset links are current.");
}
