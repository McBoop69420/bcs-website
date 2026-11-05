import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const config = await readFile(new URL("_config.yml", root), "utf8");
const excluded = [...config.matchAll(/^\s*-\s+(\S+)\s*$/gm)].map((match) => match[1]);

const isExcluded = (path) =>
  excluded.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));

test("nothing new at the top of the repo gets published by accident", async () => {
  const publicDirectories = ["blog/", "css/", "downloads/", "Images/", "js/"];
  const publicFiles = /\.html$|^robots\.txt$|^sitemap\.xml$/;
  // Jekyll already skips names that start with these, and never sees node_modules.
  const skippedByJekyll = /^[._#~]|^node_modules$/;

  const entries = await readdir(root, { withFileTypes: true });
  const unexpected = entries
    .filter((entry) => !skippedByJekyll.test(entry.name))
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
    .filter((path) => !isExcluded(path))
    .filter((path) => (path.endsWith("/") ? !publicDirectories.includes(path) : !publicFiles.test(path)));

  assert.deepEqual(unexpected, [], "add these to _config.yml, or to this test if they are meant to be public");
});

test("internal files inside public folders stay unpublished", () => {
  for (const path of ["style-bible.html", "css/style-bible.css", "Images/deprecated/README.md"]) {
    assert.ok(isExcluded(path), `${path} should be listed in _config.yml`);
  }
});

test("excluded folders end in a slash so they can't hide similarly named pages", async () => {
  // Jekyll matches excludes by prefix: "test" would also drop a page like "testimonials.html".
  for (const entry of excluded) {
    const info = await stat(new URL(entry, root));
    assert.equal(entry.endsWith("/"), info.isDirectory(), `${entry} has the wrong form`);
  }
});

test("every page in the sitemap stays published", async () => {
  const sitemap = await readFile(new URL("sitemap.xml", root), "utf8");
  const paths = [...sitemap.matchAll(/<loc>https:\/\/[^/]+\/([^<]*)<\/loc>/g)].map((match) => match[1]);

  assert.ok(paths.length > 0);
  assert.deepEqual(paths.filter(isExcluded), []);
});
