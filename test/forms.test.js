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
const policyFinderSource = await readFile(new URL("js/policy-finder.js", root), "utf8");

function signupForm(html) {
  const match = html.match(/<form\b[^>]*data-bcs-signup[\s\S]*?<\/form>/);
  assert.ok(match, "expected one data-bcs-signup form");
  return match[0];
}

async function runSignupClient({ extraFields = [], token = "", turnstile } = {}) {
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
    ...extraFields,
  ];
  const formListeners = {};
  const form = {
    addEventListener(event, handler) {
      formListeners[event] = handler;
    },
    appendChild() {},
    dataset: {},
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
  const bodies = [];
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
    fetch: async (_url, init) => {
      fetchCalls += 1;
      bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ ok: true, message: "Thanks" }) };
    },
    window,
  });

  vm.runInContext(signupSource, context);
  domReady();
  formListeners.submit({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));

  return { bodies, fetchCalls, resetCalls, status, window };
}

function fakeElement(props = {}) {
  const element = {
    children: [],
    listeners: {},
    style: {},
    textContent: "",
    addEventListener(event, handler) {
      element.listeners[event] = handler;
    },
    appendChild(child) {
      element.children.push(child);
      return child;
    },
    ...props,
  };
  return element;
}

function allText(element) {
  return [element.textContent, ...(element.children || []).map(allText)].join("");
}

function runPolicyFinder(answers) {
  const steps = answers.map((value, index) => fakeElement({
    getAttribute: () => String(index + 1),
    querySelector: () => ({ value }),
  }));
  const next = fakeElement();
  const appParts = {
    "[data-finder-form]": fakeElement(),
    "[data-finder-progress]": fakeElement(),
    "[data-finder-progress-bar]": fakeElement(),
    "[data-finder-back]": fakeElement(),
    "[data-finder-next]": next,
  };
  const app = fakeElement({
    querySelector: (selector) => appParts[selector],
    querySelectorAll: () => steps,
    scrollIntoView() {},
  });
  const cards = ["infosec", "bcp", "vendor", "ir"].map((key) => fakeElement({
    getAttribute: () => key,
    hidden: true,
  }));
  const summary = fakeElement();
  const industryField = fakeElement();
  const resultParts = {
    "[data-finder-results-heading]": fakeElement(),
    "[data-finder-results-summary]": summary,
    "[data-finder-summary-field]": fakeElement(),
    "[data-finder-industry-field]": industryField,
  };
  const results = fakeElement({
    hidden: true,
    querySelector: (selector) => resultParts[selector] || null,
    querySelectorAll: () => cards,
    scrollIntoView() {},
  });
  let domReady;
  const document = {
    addEventListener(event, handler) {
      if (event === "DOMContentLoaded") domReady = handler;
    },
    createElement: () => fakeElement(),
    createTextNode: (textContent) => ({ textContent }),
    querySelector: (selector) => ({
      "[data-finder-app]": app,
      "[data-finder-results]": results,
    })[selector],
  };

  vm.runInContext(policyFinderSource, vm.createContext({ document }));
  domReady();
  answers.forEach(() => next.listeners.click());

  return {
    industry: industryField.value,
    summary: allText(summary),
    visibleCards: cards.filter((card) => !card.hidden).map((card) => card.getAttribute()),
  };
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
  assert.equal(result.status.className, "form-status success");
  assert.equal(result.window.location.href, "");
  assert.equal(result.resetCalls.length, 1);
});

test("hidden lead fields reach the Worker, but the Turnstile input does not", async () => {
  const result = await runSignupClient({
    extraFields: [
      { name: "template_name", type: "hidden", value: "Password Standard" },
      { name: "industry", type: "hidden", value: "Bank" },
      { name: "cf-turnstile-response", type: "hidden", value: "valid-token" },
    ],
    token: "valid-token",
    turnstile: true,
  });

  assert.equal(result.bodies.length, 1);
  assert.equal(result.bodies[0].template_name, "Password Standard");
  assert.equal(result.bodies[0].industry, "Bank");
  assert.equal(result.bodies[0].turnstileToken, "valid-token");
  assert.ok(!("cf-turnstile-response" in result.bodies[0]));
});

test("the email fallback keeps hidden lead fields", async () => {
  const result = await runSignupClient({
    extraFields: [{ name: "template_name", type: "hidden", value: "Password Standard" }],
  });

  assert.match(decodeURIComponent(result.window.location.href), /template_name: Password Standard/);
});

test("Policy Finder only suggests the Complete bundle when all four templates are recommended", () => {
  const allFour = runPolicyFinder(["bank", "no", "none", "none", "none", "no"]);
  assert.deepEqual(allFour.visibleCards, ["infosec", "bcp", "vendor", "ir"]);
  assert.match(allFour.summary, /Complete Compliance Bundle/);
  assert.equal(allFour.industry, "Bank");

  const three = runPolicyFinder(["bank", "no", "none", "tested", "none", "no"]);
  assert.deepEqual(three.visibleCards, ["infosec", "vendor", "ir"]);
  assert.doesNotMatch(three.summary, /Complete Compliance Bundle/);

  const none = runPolicyFinder(["bank", "no", "yes", "tested", "yes", "yes"]);
  assert.deepEqual(none.visibleCards, []);
  assert.doesNotMatch(none.summary, /Complete Compliance Bundle/);
});

test("hidden Policy Finder cards override the product card's flex display", async () => {
  const css = await readFile(new URL("css/pages.css", root), "utf8");

  assert.match(css, /\.finder-result-card\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
});
