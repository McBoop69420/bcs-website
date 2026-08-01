import assert from "node:assert/strict";
import test from "node:test";

import worker from "../cloudflare/worker.js";
import { MockKV } from "./support/mock-kv.js";

const BASE_URL = "https://www.bluegrasscybersecurity.com";

function makeEnv(kv = new MockKV()) {
  return {
    EXPORT_SECRET: "export-secret",
    LEADS: kv,
    TURNSTILE_SECRET: "turnstile-secret",
  };
}

function makeSignupRequest(body, {
  contentType = "application/json",
  country,
  ip,
} = {}) {
  const headers = { "content-type": contentType };
  if (ip) headers["cf-connecting-ip"] = ip;
  const request = new Request(`${BASE_URL}/api/signup`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  if (country) Object.defineProperty(request, "cf", { value: { country } });
  return request;
}

function stubTurnstile(t, { success = true } = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ success }), {
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

function exportRequest({ authorization, query = "" } = {}) {
  const headers = authorization ? { authorization } : {};
  return new Request(`${BASE_URL}/api/leads/export${query}`, { headers });
}

function leadKeys(kv) {
  return [...kv.entries.keys()].filter((key) => key.startsWith("lead:"));
}

test("redirects HTTP requests to HTTPS and preserves the path and query", async () => {
  const request = new Request(`${BASE_URL}/contact.html?source=test`, {
    headers: { "x-forwarded-proto": "http" },
  });

  const response = await worker.fetch(request, makeEnv());

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), `${BASE_URL}/contact.html?source=test`);
});

test("proxies site requests and adds the canonical security headers", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("origin", {
    headers: { "content-type": "text/plain" },
  }));

  const response = await worker.fetch(new Request(`${BASE_URL}/about.html`), makeEnv());

  assert.equal(await response.text(), "origin");
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
});

test("rejects non-POST signup requests", async () => {
  const response = await worker.fetch(
    new Request(`${BASE_URL}/api/signup`),
    makeEnv()
  );

  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { ok: false, error: "Method not allowed" });
});

test("returns 400 for an invalid request body", async () => {
  const response = await worker.fetch(
    makeSignupRequest("{not-json"),
    makeEnv()
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "Invalid request body" });
});

test("returns 422 for malformed and non-string email values", async (t) => {
  const cases = [undefined, "not-an-email", 123];

  for (const email of cases) {
    await t.test(String(email), async () => {
      const response = await worker.fetch(
        makeSignupRequest({ email, turnstileToken: "token" }),
        makeEnv()
      );
      assert.equal(response.status, 422);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: "A valid email is required",
      });
    });
  }
});

test("returns 403 when Turnstile rejects the token", async (t) => {
  const calls = stubTurnstile(t, { success: false });

  const response = await worker.fetch(
    makeSignupRequest({
      email: "person@example.com",
      turnstileToken: "bad-token",
    }),
    makeEnv()
  );

  assert.equal(response.status, 403);
  assert.equal(calls.length, 1);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "Human verification failed",
  });
});

test("valid signup verifies Turnstile and preserves additional form fields", async (t) => {
  const calls = stubTurnstile(t);
  const kv = new MockKV({ enforceMetadataLimit: true });

  const response = await worker.fetch(
    makeSignupRequest({
      email: "  person@example.com  ",
      form_type: "consultation",
      message: "Need exam preparation help",
      name: "Pat Example",
      organization: "Community Bank",
      service_interest: "Exam prep",
      timeline: "This quarter",
      turnstileToken: "valid-token",
    }, { country: "US", ip: "203.0.113.10" }),
    makeEnv(kv)
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(calls[0].init.body.get("secret"), "turnstile-secret");
  assert.equal(calls[0].init.body.get("response"), "valid-token");
  assert.equal(calls[0].init.body.get("remoteip"), "203.0.113.10");

  const keys = leadKeys(kv);
  assert.equal(keys.length, 1);
  const entry = kv.entry(keys[0]);
  const record = JSON.parse(entry.value);
  assert.equal(record.email, "person@example.com");
  assert.equal(record.ip_country, "US");
  assert.deepEqual(record.extra, {
    message: "Need exam preparation help",
    service_interest: "Exam prep",
    timeline: "This quarter",
  });
  assert.deepEqual(JSON.parse(entry.metadata.details), record.extra);
  assert.ok(Buffer.byteLength(JSON.stringify(entry.metadata), "utf8") <= 1024);
});

test("limits signup attempts by IP", async (t) => {
  const calls = stubTurnstile(t);
  const kv = new MockKV();
  const env = makeEnv(kv);
  const ip = "203.0.113.20";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await worker.fetch(
      makeSignupRequest({
        email: `person${attempt}@example.com`,
        turnstileToken: `token-${attempt}`,
      }, { ip }),
      env
    );
    assert.equal(response.status, 200);
  }

  const blocked = await worker.fetch(
    makeSignupRequest({
      email: "blocked@example.com",
      turnstileToken: "token-5",
    }, { ip }),
    env
  );

  assert.equal(blocked.status, 429);
  assert.equal(calls.length, 5);
  assert.equal(kv.entry(`ratelimit:${ip}`).value, "5");
});

test("export requires a Bearer token and ignores query-string secrets", async (t) => {
  const cases = [
    ["missing header", exportRequest()],
    ["query string", exportRequest({ query: "?secret=export-secret" })],
    ["wrong token", exportRequest({ authorization: "Bearer wrong" })],
  ];

  for (const [name, request] of cases) {
    await t.test(name, async () => {
      const response = await worker.fetch(request, makeEnv());
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { ok: false, error: "Unauthorized" });
    });
  }
});

test("export paginates metadata-backed leads and sorts newest first", async () => {
  const kv = new MockKV({ pageSize: 1 });
  kv.seed("lead:old", "unused", {
    metadata: {
      received_at: "2026-01-01T00:00:00.000Z",
      form_type: "contact",
      name: "Old Lead",
      email: "old@example.com",
      organization: "",
      ip_country: "US",
      details: "{}",
    },
  });
  kv.seed("lead:new", "unused", {
    metadata: {
      received_at: "2026-07-01T00:00:00.000Z",
      form_type: "contact",
      name: "New Lead",
      email: "new@example.com",
      organization: "",
      ip_country: "US",
      details: "{}",
    },
  });

  const response = await worker.fetch(
    exportRequest({ authorization: "Bearer export-secret" }),
    makeEnv(kv)
  );
  const csv = await response.text();

  assert.equal(response.status, 200);
  assert.ok(csv.indexOf("new@example.com") < csv.indexOf("old@example.com"));
  assert.equal(kv.calls.list.length, 2);
  assert.equal(kv.calls.get.length, 0);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="bcs-leads.csv"'
  );
});

test("export neutralizes spreadsheet formulas and escapes quotes", async () => {
  const kv = new MockKV();
  kv.seed("lead:formula", "unused", {
    metadata: {
      received_at: "2026-07-01T00:00:00.000Z",
      form_type: "@SUM(1,1)",
      name: '=HYPERLINK("https://example.test")',
      email: "person@example.com",
      organization: "+cmd",
      ip_country: "-1",
      details: "{}",
    },
  });

  const response = await worker.fetch(
    exportRequest({ authorization: "Bearer export-secret" }),
    makeEnv(kv)
  );
  const csv = await response.text();

  assert.match(csv, /"'@SUM\(1,1\)"/);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  assert.match(csv, /"'\+cmd"/);
  assert.match(csv, /"'-1"/);
});

test("native form submissions accept cf-turnstile-response", async (t) => {
  stubTurnstile(t);
  const body = new URLSearchParams({
    email: "person@example.com",
    "cf-turnstile-response": "native-token",
  }).toString();

  const response = await worker.fetch(
    makeSignupRequest(body, { contentType: "application/x-www-form-urlencoded" }),
    makeEnv()
  );

  assert.equal(response.status, 200);
});

test("metadata remains within the UTF-8 byte limit", async (t) => {
  stubTurnstile(t);
  const kv = new MockKV({ enforceMetadataLimit: true });

  const response = await worker.fetch(
    makeSignupRequest({
      email: "person@example.com",
      form_type: "contact",
      name: "漢".repeat(200),
      organization: "漢".repeat(200),
      turnstileToken: "valid-token",
    }),
    makeEnv(kv)
  );

  assert.equal(response.status, 200);
});

test("rate limiting tolerates multiple requests within one second", async (t) => {
  stubTurnstile(t);
  const kv = new MockKV({ rejectRepeatedWrites: true });
  const env = makeEnv(kv);
  const ip = "203.0.113.30";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await worker.fetch(
      makeSignupRequest({
        email: `person${attempt}@example.com`,
        turnstileToken: `token-${attempt}`,
      }, { ip }),
      env
    );
    assert.equal(response.status, 200);
  }
});

test("export includes lead values written before metadata was introduced", async () => {
  const kv = new MockKV();
  kv.seed("lead:legacy", JSON.stringify({
    received_at: "2026-01-01T00:00:00.000Z",
    form_type: "contact",
    name: "Legacy Lead",
    email: "legacy@example.com",
    organization: "",
    extra: {},
    ip_country: "US",
  }));

  const response = await worker.fetch(
    exportRequest({ authorization: "Bearer export-secret" }),
    makeEnv(kv)
  );
  const csv = await response.text();

  assert.match(csv, /legacy@example\.com/);
});
