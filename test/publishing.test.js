import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const config = await readFile(new URL("_config.yml", root), "utf8");
const excludeBlock = config.match(/^exclude:\n((?:\s+-\s+\S+\n)+)/m)[1];
const excluded = [...excludeBlock.matchAll(/-\s+(\S+)/g)].map((match) => match[1]);

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

test("security.txt gets published and hasn't expired", async () => {
  assert.match(config, /^include:\n\s+-\s+\.well-known$/m);

  const text = await readFile(new URL(".well-known/security.txt", root), "utf8");
  assert.match(text, /^Contact: mailto:\S+$/m);
  assert.match(text, /^Canonical: https:\/\/www\.bluegrasscybersecurity\.com\/\.well-known\/security\.txt$/m);

  const daysLeft = (new Date(text.match(/^Expires: (\S+)$/m)[1]) - Date.now()) / 86_400_000;
  assert.ok(daysLeft > 30, "security.txt is about to expire: set a new date less than a year out");
  assert.ok(daysLeft < 366, "security.txt should expire within a year");
});

test("every page footer links to the privacy policy and terms", async () => {
  const blogPages = (await readdir(new URL("blog/", root))).filter((name) => name.endsWith(".html"));
  const topPages = (await readdir(root)).filter((name) => name.endsWith(".html"));

  for (const [names, prefix, folder] of [[topPages, "", ""], [blogPages, "../", "blog/"]]) {
    for (const name of names) {
      const html = await readFile(new URL(folder + name, root), "utf8");
      if (!html.includes('class="footer-links"')) continue;
      assert.ok(html.includes(`href="${prefix}privacy.html"`), `${name} needs a privacy link`);
      assert.ok(html.includes(`href="${prefix}terms.html"`), `${name} needs a terms link`);
    }
  }
});
