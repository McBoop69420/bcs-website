import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const pageNames = ["contact.html", "ai-risk-governance.html"];
const pages = new Map(
  await Promise.all(pageNames.map(async (name) => [
    name,
    await readFile(new URL(name, root), "utf8"),
  ]))
);
const signupSource = await readFile(new URL("js/signup.js", root), "utf8");

function signupForm(html) {
  const match = html.match(/<form\b[^>]*data-bcs-signup[\s\S]*?<\/form>/);
  assert.ok(match, "expected one data-bcs-signup form");
  return match[0];
}

async function runSignupClient({ token = "", turnstile } = {}) {
  const status = { className: "form-status", textContent: "" };
  const hiddenToken = { value: token };
  const resetCalls = [];
  const widget = {
    dataset: {},
    id: "contact-turnstile",
    querySelector(selector) {
      return selector === 'input[name="cf-turnstile-response"]' ? hiddenToken : null;
    },
  };
  const fields = [
    { name: "email", type: "email", value: "person@example.com" },
    { name: "message", type: "textarea", value: "Need help" },
  ];
  const formListeners = {};
  const form = {
    addEventListener(event, handler) {
      formListeners[event] = handler;
    },
    appendChild() {},
    querySelector(selector) {
      if (selector === ".cf-turnstile") return widget;
      if (selector === ".form-status") return status;
      if (selector === 'input[name="form_type"]') return { value: "contact" };
      if (selector === 'input[name="subject"]') return { value: "Contact request" };
      if (selector === 'input[name="consent"]') return null;
      return null;
    },
    querySelectorAll() {
      return fields;
    },
    reset() {},
  };
  let domReady;
  let fetchCalls = 0;
  const window = {
    location: { href: "" },
    turnstile: turnstile === undefined ? undefined : {
      reset(target) {
        resetCalls.push(target);
      },
    },
  };
  const document = {
    addEventListener(event, handler) {
      if (event === "DOMContentLoaded") domReady = handler;
    },
    createElement() {
      return { className: "", textContent: "" };
    },
    querySelectorAll() {
      return [form];
    },
  };
  const context = vm.createContext({
    document,
    encodeURIComponent,
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({ ok: true, message: "Thanks" }) };
    },
    window,
  });

  vm.runInContext(signupSource, context);
  domReady();
  formListeners.submit({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));

  return { fetchCalls, resetCalls, status, window };
}

test("signup pages use the Worker endpoint and flexible Turnstile widgets", () => {
  for (const [name, html] of pages) {
    const form = signupForm(html);
    assert.match(form, /action="\/api\/signup"/i, `${name} action`);
    assert.match(form, /method="POST"/i, `${name} method`);
    assert.match(form, /class="cf-turnstile"[^>]*data-size="flexible"/i, `${name} widget`);
    assert.match(html, /<script src="js\/signup\.js"><\/script>/i, `${name} signup script`);
  }
});

test("client falls back to email when the Turnstile script is unavailable", async () => {
  const result = await runSignupClient();

  assert.equal(result.fetchCalls, 0);
  assert.match(result.window.location.href, /^mailto:info@bluegrasscybersecurity\.com/);
  assert.match(result.status.textContent, /Verification unavailable/);
});

test("Worker CSP stays synchronized with cloudflare/csp.txt", async () => {
  const workerSource = await readFile(new URL("cloudflare/worker.js", root), "utf8");
  const cspFile = await readFile(new URL("cloudflare/csp.txt", root), "utf8");
  const match = workerSource.match(/const CSP = `([^`]*)`;/);
  const normalizedCspFile = cspFile
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .join(" ");

  assert.ok(match, "expected Worker CSP constant");
  assert.equal(match[1], normalizedCspFile);
});

test("signup pages provide a no-JavaScript mailto path", () => {
  for (const [name, html] of pages) {
    const form = signupForm(html);
    assert.match(
      form,
      /<noscript>[\s\S]*mailto:info@bluegrasscybersecurity\.com[\s\S]*<\/noscript>/i,
      `${name} no-JavaScript fallback`
    );
  }
});

test("successful submissions reset the implicit Turnstile widget", async () => {
  const result = await runSignupClient({ token: "valid-token", turnstile: true });

  assert.equal(result.fetchCalls, 1);
  assert.equal(result.resetCalls.length, 1);
});
